export const MixerCurve = {

    CURVE_COUNT: 8,
    POINT_COUNT: 9,

    CURVE_MIN: -1000,
    CURVE_MAX:  1000,

    //// Functions

    // curve.points always has exactly POINT_COUNT entries, matching the
    // firmware's fixed-size wire format - count says how many from the front
    // are active; the rest are unused filler and must never be read/drawn.
    nullCurve: function ()
    {
        const points = [
            { x: this.CURVE_MIN, y: this.CURVE_MIN },
            { x: this.CURVE_MAX, y: this.CURVE_MAX },
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
    // and stays within the curve's value range in both axes.
    clampPoint: function (curve, index, x, y)
    {
        const self = this;

        const minX = (index > 0) ? curve.points[index - 1].x + 1 : self.CURVE_MIN;
        const maxX = (index < curve.count - 1) ? curve.points[index + 1].x - 1 : self.CURVE_MAX;

        return {
            x: Math.min(Math.max(x, minX), maxX),
            y: Math.min(Math.max(y, self.CURVE_MIN), self.CURVE_MAX),
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
            x: Math.min(Math.max(x, self.CURVE_MIN), self.CURVE_MAX),
            y: Math.min(Math.max(y, self.CURVE_MIN), self.CURVE_MAX),
        });
        curve.points.length = self.POINT_COUNT;
        curve.count++;

        return true;
    },

    // Remove an active point. Returns false (no change) if it would leave
    // fewer than the 2 points a curve needs to interpolate. The points array
    // stays at a fixed POINT_COUNT length - removing shifts the remaining
    // active points down and appends a fresh unused filler slot.
    removePoint: function (curve, index)
    {
        if (curve.count <= 2)
            return false;

        curve.points.splice(index, 1);
        curve.points.push({ x: 0, y: 0 });
        curve.count--;

        return true;
    },

    // Mirrors the firmware's mixerEvaluateCurve(): linear interpolation
    // through ascending-x points, clamped at the ends. x/y here are in the
    // same -1000..1000 scale as the stored points (not the -1.0..1.0 the
    // firmware works with internally).
    evaluate: function (curve, x)
    {
        const points = curve.points;
        const n = curve.count;

        if (n < 2) return x;
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

        return x;
    },

};
