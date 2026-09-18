// Per-servo output trim curve, added on top of a servo's own output on the
// flight controller (after mixing and geometry correction, if enabled) -
// see servoUpdate() in flight/servos.c. Used to nudge one servo's travel to
// match another servo driving the same control surface (e.g. dual
// ailerons), so they don't fight each other near full deflection.
//
// Unlike MixerCurve/GainCurve, this is a corrective delta, not a reshape:
// x is the servo's own output (full -100%..100% range), but y is a small
// offset added to it, not a replacement value - so the default curve is
// flat at 0 (no correction) rather than diagonal, and y is constrained to
// a much narrower range than x (matching FrSky ETHOS's own "Balance
// channels" tool, which uses the same +-10% delta convention).
//
// Also unlike MixerCurve/GainCurve, there's no fixed pool: the number of
// curves is exactly the live servo count (FC.SERVO_CURVES.length), one per
// physical servo - so this module intentionally has no CURVE_COUNT
// constant. Curves.svelte drives the "Servo N" picker off the array's
// actual length instead.
export const ServoBalanceCurve = {

    POINT_COUNT: 9,

    X_MIN: -1000,
    X_MAX:  1000,

    Y_MIN: -100,
    Y_MAX:  100,

    // Delta applied when a curve is absent, flat, or evaluated outside its
    // defined shape - 0 = no correction.
    NEUTRAL: 0,

    //// Functions

    // curve.points always has exactly POINT_COUNT entries, matching the
    // firmware's fixed-size wire format - count says how many from the front
    // are active; the rest are unused filler and must never be read/drawn.
    nullCurve: function ()
    {
        const points = [
            { x: this.X_MIN, y: this.NEUTRAL },
            { x: this.X_MAX, y: this.NEUTRAL },
        ];

        while (points.length < this.POINT_COUNT) {
            points.push({ x: 0, y: 0 });
        }

        return { count: 2, points: points };
    },

    clonePoint: function (a)
    {
        return Object.assign({}, a);
    },

    cloneCurve: function (a)
    {
        const self = this;
        return {
            count: a.count,
            points: a.points.map(function (point) { return self.clonePoint(point); }),
        };
    },

    cloneCurves: function (a)
    {
        const self = this;
        const copy = [];

        if (a) {
            a.forEach(function (curve) {
                copy.push(self.cloneCurve(curve));
            });
        }

        return copy;
    },

    comparePoint: function (a, b)
    {
        return (a.x === b.x && a.y === b.y);
    },

    compareCurve: function (a, b)
    {
        const self = this;

        if (a.count !== b.count)
            return false;

        for (let i = 0; i < a.count; i++)
            if (!self.comparePoint(a.points[i], b.points[i]))
                return false;

        return true;
    },

    // Clamp a dragged point so it can never cross its immediate neighbors in x
    // (the firmware assumes ascending-x points and does no defensive sorting),
    // and stays within the curve's value range in both axes. The first and
    // last active points are pinned to X_MIN/X_MAX exactly - they define the
    // curve's domain extent, so only their y is adjustable (see removePoint()
    // below for the matching protection against deleting either one
    // outright).
    clampPoint: function (curve, index, x, y)
    {
        const self = this;
        const clampedY = Math.min(Math.max(y, self.Y_MIN), self.Y_MAX);

        if (index === 0)
            return { x: self.X_MIN, y: clampedY };
        if (index === curve.count - 1)
            return { x: self.X_MAX, y: clampedY };

        const minX = curve.points[index - 1].x + 1;
        const maxX = curve.points[index + 1].x - 1;

        return {
            x: Math.min(Math.max(x, minX), maxX),
            y: clampedY,
        };
    },

    // Insert a new point in ascending-x order, among the active (first
    // `count`) points only. Returns false (no change) if the curve is
    // already at POINT_COUNT, or a point already exists at x. The points
    // array stays at a fixed POINT_COUNT length - inserting shifts the
    // active points up and drops the now-stale last (unused) slot.
    addPoint: function (curve, x, y)
    {
        const self = this;

        if (curve.count >= self.POINT_COUNT)
            return false;

        let index = curve.points.slice(0, curve.count).findIndex(function (point) { return point.x > x; });
        if (index === -1) index = curve.count;

        if (index > 0 && curve.points[index - 1].x === x)
            return false;

        curve.points.splice(index, 0, {
            x: Math.min(Math.max(x, self.X_MIN), self.X_MAX),
            y: Math.min(Math.max(y, self.Y_MIN), self.Y_MAX),
        });
        curve.points.length = self.POINT_COUNT;
        curve.count++;

        return true;
    },

    // Convenience for an "Add Point" button (which has no click position to
    // work from, unlike clicking directly on the plot): finds the widest gap
    // between adjacent active points and inserts a new point at its x
    // midpoint, with y taken from the curve's own current value there - so
    // the new point lands exactly on the existing line instead of creating a
    // visible kink, and the user can then drag it to reshape the curve.
    addPointAtLargestGap: function (curve)
    {
        const self = this;

        if (curve.count >= self.POINT_COUNT)
            return false;

        let bestIndex = 0;
        let bestGap = -1;

        for (let i = 0; i < curve.count - 1; i++) {
            const gap = curve.points[i + 1].x - curve.points[i].x;
            if (gap > bestGap) {
                bestGap = gap;
                bestIndex = i;
            }
        }

        const midX = Math.round((curve.points[bestIndex].x + curve.points[bestIndex + 1].x) / 2);
        const midY = Math.round(self.evaluate(curve, midX));

        return self.addPoint(curve, midX, midY);
    },

    // Adjust the curve's active point count to exactly `targetCount` by
    // repeatedly adding (at the largest gap) or removing (keeping both
    // endpoints intact as long as possible) interior points.
    setPointCount: function (curve, targetCount)
    {
        const self = this;

        while (curve.count < targetCount) {
            if (!self.addPointAtLargestGap(curve)) break;
        }
        while (curve.count > targetCount) {
            if (!self.removePoint(curve, curve.count - 2)) break;
        }
    },

    // Remove an active point. Returns false (no change) if it would leave
    // fewer than the 2 points a curve needs to interpolate, or if `index` is
    // the first or last active point - those define the curve's domain
    // extent (X_MIN/X_MAX) and must never be deleted outright (see
    // clampPoint()'s matching protection against dragging them away from
    // it). The points array stays at a fixed POINT_COUNT length - removing
    // shifts the remaining active points down and appends a fresh unused
    // filler slot.
    removePoint: function (curve, index)
    {
        if (curve.count <= 2)
            return false;
        if (index === 0 || index === curve.count - 1)
            return false;

        curve.points.splice(index, 1);
        curve.points.push({ x: 0, y: 0 });
        curve.count--;

        return true;
    },

    // Mirrors the firmware's evaluateCurvePoints() as applied (additively)
    // in servoUpdate(): linear interpolation through ascending-x points,
    // clamped at the ends. x here is on the same -1000..1000 scale as
    // MixerCurve's x (the servo's own output); y is a delta on the much
    // narrower Y_MIN..Y_MAX scale, so out-of-shape results fall back to
    // NEUTRAL (0, i.e. no correction) rather than passing x through.
    evaluate: function (curve, x)
    {
        const points = curve.points;
        const n = curve.count;

        if (n < 2) return this.NEUTRAL;
        if (x <= points[0].x) return points[0].y;
        if (x >= points[n - 1].x) return points[n - 1].y;

        for (let i = 0; i < n - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];

            if (x >= p0.x && x <= p1.x) {
                const t = (p1.x !== p0.x) ? (x - p0.x) / (p1.x - p0.x) : 0;
                return p0.y + t * (p1.y - p0.y);
            }
        }

        return this.NEUTRAL;
    },

};
