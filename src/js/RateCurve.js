const midRc = 1500;
const maxRc = 2000;

export const RateCurve = function () {
    this.maxAngularVel = null;

    this.constrain = function (value, min, max) {
        return Math.max(min, Math.min(value, max));
    };

    this.rcCommand = function (rcData, rcRate, deadband) {
        const tmp = Math.max(Math.abs(rcData - midRc) - deadband, 0);

        let result = tmp * rcRate;
        if (rcData < midRc) {
            result = -result;
        }

        return result;
    };

    this.drawRateCurve = function (ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, width, height, opts = {}) {
        const rcRange = opts.rcRange ?? 500;
        const canvasHeightScale = height / (2 * maxAngularVel);
        const canvasWidthScale = rcRange / 500;

        const stepWidth = context.lineWidth;

        context.save();
        context.translate(width / 2, height / 2);

        context.beginPath();
        let rcData = midRc - rcRange;

        const getYPos = (rcPos) => {
            let value = this.rcCommandRawToDegreesPerSecond(rcPos, ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, limit);
            if (opts.maxAngularVel) {
                value = Math.max(Math.min(value, opts.maxAngularVel), -opts.maxAngularVel);
            }
            return value;
        };

        let xPos = -500;
        let yPos = -canvasHeightScale * getYPos(rcData);
        context.moveTo(xPos, yPos);
        rcData = rcData + stepWidth;
        while (rcData <= midRc + rcRange) {
            xPos = (rcData - midRc) / canvasWidthScale;
            yPos = -canvasHeightScale * getYPos(rcData);
            context.lineTo(xPos, yPos);

            rcData = rcData + stepWidth;
        }
        xPos = 500;
        yPos = -canvasHeightScale * getYPos(midRc + rcRange);
        context.lineTo(xPos, yPos);
        context.stroke();

        context.restore();
    };

    function rfPow(x, expo) {
        const bits = Math.min(expo, 127);

        let y = x * x;
        let z = x;

        if (bits & (1 << 4)) y *= z;
        z *= z;
        if (bits & (1 << 5)) y *= z;
        z *= z;
        if (bits & (1 << 6)) y *= z;

        z = Math.sqrt(x);
        if (bits & (1 << 3)) y *= z;
        z = Math.sqrt(z);
        if (bits & (1 << 2)) y *= z;
        z = Math.sqrt(z);
        if (bits & (1 << 1)) y *= z;
        z = Math.sqrt(z);
        if (bits & (1 << 0)) y *= z;

        return y;
    }

    this.getWingflightRates = function (rcCommandf, rcCommandfAbs, srate, rcRate, rcExpo) {
        const expof = rcCommandf * (1 - rcExpo) + Math.sign(rcCommandf) * rfPow(rcCommandfAbs, srate) * rcExpo;

        return rcRate * expof;
    };

};

RateCurve.prototype.rcCommandRawToDegreesPerSecond = function (rcData, ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, _limit) {
    let angleRate;

    if (rate !== undefined && rcRate !== undefined && rcExpo !== undefined) {

        let rcCommandf = this.rcCommand(rcData, 1, deadband);

        rcCommandf = rcCommandf / (500 - deadband);

        const rcCommandfAbs = Math.abs(rcCommandf);

        angleRate = this.getWingflightRates(rcCommandf, rcCommandfAbs, rate, rcRate, rcExpo / 100);
    }

    return angleRate;
};

RateCurve.prototype.getMaxAngularVel = function (ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, limit) {
    return this.rcCommandRawToDegreesPerSecond(maxRc, ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, limit);
};

RateCurve.prototype.setMaxAngularVel = function (value) {
    this.maxAngularVel = Math.ceil(value/200) * 200;
    return this.maxAngularVel;

};

RateCurve.prototype.draw = function (ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, opts) {
    if (rate !== undefined && rcRate !== undefined && rcExpo !== undefined) {
        const height = context.canvas.height;
        const width = context.canvas.width;

        this.drawRateCurve(ratesType, rate, rcRate, rcExpo, superExpoActive, deadband, limit, maxAngularVel, context, width, height, opts);
    }
};
