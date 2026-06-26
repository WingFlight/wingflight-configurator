import { MixerCurve } from '@/js/MixerCurve.js';

const tab = {
    tabName: 'curves',
    isDirty: false,
    needSave: false,
    CURVES_dirty: false,
    selectedCurve: 0,
};

tab.initialize = function (callback) {
    const self = this;

    function setDirty() {
        if (!self.isDirty) {
            self.isDirty = true;
            $('.tab-curves').removeClass('toolbar_hidden');
        }
    }

    load_data(load_html);

    function load_html() {
        $('#content').load("/src/tabs/curves.html", process_html);
    }

    function load_data(callback) {
        MSP.promise(MSPCodes.MSP_MIXER_CURVES)
            .then(callback);
    }

    function save_data(callback) {
        function send_curves() {
            if (self.CURVES_dirty)
                mspHelper.sendMixerCurves(save_eeprom);
            else
                save_eeprom();
        }
        function save_eeprom() {
            if (self.needSave)
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, eeprom_saved);
            else
                save_done();
        }
        function eeprom_saved() {
            GUI.log(i18n.getMessage('eepromSaved'));
            self.needSave = false;
            save_done();
        }
        function save_done() {
            self.CURVES_dirty = false;
            self.isDirty = false;
            callback?.();
        }

        send_curves();
    }

    // Map between curve units (-1000..1000) and the SVG viewBox (0..400,
    // y-flipped since SVG y grows downward but a curve's y should grow up).
    // Inset by PADDING so points at the extreme corners aren't clipped by
    // the viewBox edge (a point sitting exactly on the boundary would only
    // be half/quarter-visible, and barely clickable).
    const PLOT_SIZE = 400;
    const PADDING = 20;
    const PLOT_INNER = PLOT_SIZE - PADDING * 2;

    function toSvgX(x) {
        return PADDING + (x - MixerCurve.CURVE_MIN) / (MixerCurve.CURVE_MAX - MixerCurve.CURVE_MIN) * PLOT_INNER;
    }
    function toSvgY(y) {
        return PADDING + PLOT_INNER - (y - MixerCurve.CURVE_MIN) / (MixerCurve.CURVE_MAX - MixerCurve.CURVE_MIN) * PLOT_INNER;
    }
    function fromSvgX(sx) {
        return (sx - PADDING) / PLOT_INNER * (MixerCurve.CURVE_MAX - MixerCurve.CURVE_MIN) + MixerCurve.CURVE_MIN;
    }
    function fromSvgY(sy) {
        return (PLOT_INNER - (sy - PADDING)) / PLOT_INNER * (MixerCurve.CURVE_MAX - MixerCurve.CURVE_MIN) + MixerCurve.CURVE_MIN;
    }

    function svgPointFromEvent(svg, event) {
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: fromSvgX(transformed.x), y: fromSvgY(transformed.y) };
    }

    function ns(tag) {
        return document.createElementNS('http://www.w3.org/2000/svg', tag);
    }

    function renderCurveSvg() {
        const svg = document.getElementById('curveSvg');
        const tableBody = document.getElementById('curvePointTableBody');
        if (!svg || !tableBody) return;

        while (svg.firstChild) svg.removeChild(svg.firstChild);
        while (tableBody.firstChild) tableBody.removeChild(tableBody.firstChild);

        const curve = FC.MIXER_CURVES[self.selectedCurve];

        updatePointCountSelect(curve);

        // Gridlines every 25%, bold axes through the middle
        [-1000, -500, 0, 500, 1000].forEach(function (v) {
            const vLine = ns('line');
            vLine.setAttribute('x1', toSvgX(v));
            vLine.setAttribute('x2', toSvgX(v));
            vLine.setAttribute('y1', 0);
            vLine.setAttribute('y2', PLOT_SIZE);
            vLine.setAttribute('class', v === 0 ? 'curveAxis' : 'curveGrid');
            svg.appendChild(vLine);

            const hLine = ns('line');
            hLine.setAttribute('y1', toSvgY(v));
            hLine.setAttribute('y2', toSvgY(v));
            hLine.setAttribute('x1', 0);
            hLine.setAttribute('x2', PLOT_SIZE);
            hLine.setAttribute('class', v === 0 ? 'curveAxis' : 'curveGrid');
            svg.appendChild(hLine);
        });

        const polyline = ns('polyline');
        polyline.setAttribute('class', 'curveLine');
        svg.appendChild(polyline);

        // Only the first `count` points are active - the rest are unused
        // filler kept around solely to match the firmware's fixed-size wire
        // format, and must never be drawn, connected, or listed.
        const activePoints = curve.points.slice(0, curve.count);

        const circles = activePoints.map(function () {
            const circle = ns('circle');
            circle.setAttribute('class', 'curvePoint');
            circle.setAttribute('r', 6);
            svg.appendChild(circle);
            return circle;
        });

        // Floating "x, y" readout that follows a point while it's being
        // dragged - hidden the rest of the time.
        const coordLabelBg = ns('rect');
        coordLabelBg.setAttribute('class', 'curveCoordLabelBg');
        coordLabelBg.setAttribute('rx', 3);
        coordLabelBg.style.display = 'none';
        svg.appendChild(coordLabelBg);

        const coordLabel = ns('text');
        coordLabel.setAttribute('class', 'curveCoordLabel');
        coordLabel.style.display = 'none';
        svg.appendChild(coordLabel);

        function showCoordLabel(p) {
            coordLabel.textContent = Math.round(p.x) + ', ' + Math.round(p.y);
            coordLabel.setAttribute('x', toSvgX(p.x) + 14);
            coordLabel.setAttribute('y', toSvgY(p.y) - 0);
            coordLabel.style.display = '';

            // getBBox() needs the text visible/in the DOM first (done above)
            // to return accurate measurements - fits the background exactly
            // instead of guessing a width from the character count.
            const bbox = coordLabel.getBBox();
            coordLabelBg.setAttribute('x', bbox.x - 4);
            coordLabelBg.setAttribute('y', bbox.y - 2);
            coordLabelBg.setAttribute('width', bbox.width + 8);
            coordLabelBg.setAttribute('height', bbox.height + 4);
            coordLabelBg.style.display = '';
        }

        function hideCoordLabel() {
            coordLabel.style.display = 'none';
            coordLabelBg.style.display = 'none';
        }

        // One row per active point: index + editable X/Y + delete button,
        // kept in sync with the SVG circles in both directions.
        const rows = activePoints.map(function (point, index) {
            const row = document.createElement('tr');

            const indexCell = document.createElement('td');
            indexCell.className = 'curvePointIndex';
            indexCell.textContent = index + 1;
            row.appendChild(indexCell);

            const xInput = document.createElement('input');
            xInput.type = 'number';
            xInput.min = MixerCurve.CURVE_MIN;
            xInput.max = MixerCurve.CURVE_MAX;
            xInput.step = 10;

            const yInput = document.createElement('input');
            yInput.type = 'number';
            yInput.min = MixerCurve.CURVE_MIN;
            yInput.max = MixerCurve.CURVE_MAX;
            yInput.step = 10;

            [xInput, yInput].forEach(function (input) {
                const cell = document.createElement('td');
                cell.appendChild(input);
                row.appendChild(cell);
            });

            function commitFromInputs() {
                const clamped = MixerCurve.clampPoint(
                    curve, index,
                    Math.round(parseFloat(xInput.value)) || 0,
                    Math.round(parseFloat(yInput.value)) || 0
                );
                Object.assign(curve.points[index], clamped);
                updateGeometry();
                self.CURVES_dirty = true;
                self.needSave = true;
                setDirty();
            }

            xInput.addEventListener('change', commitFromInputs);
            yInput.addEventListener('change', commitFromInputs);

            const deleteCell = document.createElement('td');
            const deleteLink = document.createElement('a');
            deleteLink.href = '#';
            deleteLink.className = 'curvePointDelete';
            deleteLink.textContent = '✕';
            deleteLink.addEventListener('click', function (event) {
                event.preventDefault();
                if (MixerCurve.removePoint(curve, index)) {
                    self.CURVES_dirty = true;
                    self.needSave = true;
                    setDirty();
                    renderCurveSvg();
                }
            });
            deleteCell.appendChild(deleteLink);
            row.appendChild(deleteCell);

            tableBody.appendChild(row);

            return { xInput: xInput, yInput: yInput };
        });

        function updateGeometry() {
            polyline.setAttribute('points', activePoints.map(function (p) {
                return toSvgX(p.x) + ',' + toSvgY(p.y);
            }).join(' '));

            activePoints.forEach(function (p, i) {
                circles[i].setAttribute('cx', toSvgX(p.x));
                circles[i].setAttribute('cy', toSvgY(p.y));
                rows[i].xInput.value = Math.round(p.x);
                rows[i].yInput.value = Math.round(p.y);
            });
        }

        updateGeometry();

        circles.forEach(function (circle, index) {
            circle.addEventListener('pointerdown', function (event) {
                event.preventDefault();
                event.stopPropagation();
                circle.setPointerCapture(event.pointerId);
                showCoordLabel(activePoints[index]);

                function onMove(moveEvent) {
                    const point = svgPointFromEvent(svg, moveEvent);
                    const clamped = MixerCurve.clampPoint(curve, index, Math.round(point.x), Math.round(point.y));
                    // Mutate in place (not curve.points[index] = clamped) so the
                    // activePoints slice - which shares the same point objects -
                    // stays in sync without needing a full re-render per frame.
                    Object.assign(curve.points[index], clamped);
                    updateGeometry();
                    showCoordLabel(clamped);
                    self.CURVES_dirty = true;
                    self.needSave = true;
                    setDirty();
                }

                circle.addEventListener('pointermove', onMove);
                circle.addEventListener('pointerup', function onUp() {
                    circle.removeEventListener('pointermove', onMove);
                    circle.removeEventListener('pointerup', onUp);
                    hideCoordLabel();
                }, { once: true });
            });

            circle.addEventListener('contextmenu', function (event) {
                event.preventDefault();
                if (MixerCurve.removePoint(curve, index)) {
                    self.CURVES_dirty = true;
                    self.needSave = true;
                    setDirty();
                    renderCurveSvg();
                }
            });
        });

        svg.addEventListener('click', function (event) {
            if (event.target !== svg) return; // clicked a point, not the background
            const point = svgPointFromEvent(svg, event);
            if (MixerCurve.addPoint(curve, Math.round(point.x), Math.round(point.y))) {
                self.CURVES_dirty = true;
                self.needSave = true;
                setDirty();
                renderCurveSvg();
            }
        });
    }

    function populateCurveSelect() {
        const select = $('#curveSelect');
        select.empty();

        for (let i = 0; i < MixerCurve.CURVE_COUNT; i++) {
            select.append($('<option></option>').attr('value', i).text(i18n.getMessage('mixerCurveLabel', [i + 1])));
        }

        select.val(self.selectedCurve);

        select.on('change', function () {
            self.selectedCurve = parseInt(select.val(), 10);
            renderCurveSvg();
        });
    }

    // Rebuilt on every render (not just once) so it always reflects the
    // active curve's current point count, however it last changed - via
    // drag-to-add, the table's delete buttons, or this select itself.
    function updatePointCountSelect(curve) {
        const select = $('#curvePointCountSelect');
        select.empty();

        for (let n = 2; n <= MixerCurve.POINT_COUNT; n++) {
            select.append($('<option></option>').attr('value', n).text(n));
        }

        select.val(curve.count);
    }

    function process_html() {
        i18n.localizePage();

        while (FC.MIXER_CURVES.length < MixerCurve.CURVE_COUNT) {
            FC.MIXER_CURVES.push(MixerCurve.nullCurve());
        }

        self.origCurves = MixerCurve.cloneCurves(FC.MIXER_CURVES);
        self.isDirty = false;
        self.needSave = false;
        self.CURVES_dirty = false;

        $('.tab-curves').addClass('toolbar_hidden');

        populateCurveSelect();
        renderCurveSvg();

        self.save = function (callback) {
            save_data(callback);
        };

        self.revert = function (callback) {
            FC.MIXER_CURVES = self.origCurves;
            self.needSave = false;
            save_data(callback);
        };

        $('.curveResetBtn').on('click', function (event) {
            event.preventDefault();
            FC.MIXER_CURVES[self.selectedCurve] = MixerCurve.nullCurve();
            self.CURVES_dirty = true;
            self.needSave = true;
            setDirty();
            renderCurveSvg();
        });

        $('.curveAddPointBtn').on('click', function (event) {
            event.preventDefault();
            const curve = FC.MIXER_CURVES[self.selectedCurve];
            if (MixerCurve.addPointAtLargestGap(curve)) {
                self.CURVES_dirty = true;
                self.needSave = true;
                setDirty();
                renderCurveSvg();
            }
        });

        $('#curvePointCountSelect').on('change', function () {
            const curve = FC.MIXER_CURVES[self.selectedCurve];
            MixerCurve.setPointCount(curve, parseInt($(this).val(), 10));
            self.CURVES_dirty = true;
            self.needSave = true;
            setDirty();
            renderCurveSvg();
        });

        $('a.save').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.revert').click(function () {
            self.revert(() => GUI.tab_switch_reload());
        });

        GUI.content_ready(callback);
    }
};

tab.cleanup = function (callback) {
    this.isDirty = false;

    callback?.();
};

TABS[tab.tabName] = tab;

if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        if (newModule && GUI.active_tab === tab.tabName) {
          TABS[tab.tabName].initialize();
        }
    });

    import.meta.hot.dispose(() => {
        tab.cleanup();
    });
}
