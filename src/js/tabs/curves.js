import { MixerCurve } from '@/js/MixerCurve.js';
import { GainCurve } from '@/js/GainCurve.js';

// Evenly spaced tick positions across [min, max], used for both the plot's
// gridlines and to pick which one is the bold "axis" reference line.
function ticks(min, max) {
    return [0, 0.25, 0.5, 0.75, 1].map(function (f) { return min + f * (max - min); });
}

// One entry per curve pool this tab can edit. Each category owns its own
// model (point/range semantics), its FC-backed storage array, and how its
// pool is transferred over MSP - the rendering/interaction code below is
// otherwise category-agnostic.
const CATEGORIES = {
    mixer: {
        model: MixerCurve,
        titleKey: 'curvesTitle',
        helpKey: 'curveCategoryHelpMixer',
        tabClass: 'curveCategoryMixer',
        xMin: MixerCurve.CURVE_MIN, xMax: MixerCurve.CURVE_MAX,
        yMin: MixerCurve.CURVE_MIN, yMax: MixerCurve.CURVE_MAX,
        xAxisValue: 0, yAxisValue: 0,
        getArray: function () { return FC.MIXER_CURVES; },
        sendAll: function (callback) { return mspHelper.sendMixerCurves(callback); },
    },
    gain: {
        model: GainCurve,
        titleKey: 'curvesTitleGain',
        helpKey: 'curveCategoryHelpGain',
        tabClass: 'curveCategoryGain',
        xMin: GainCurve.X_MIN, xMax: GainCurve.X_MAX,
        yMin: GainCurve.Y_MIN, yMax: GainCurve.Y_MAX,
        xAxisValue: 0, yAxisValue: GainCurve.NEUTRAL,
        getArray: function () { return FC.GAIN_CURVES; },
        sendAll: function (callback) { return mspHelper.sendGainCurves(callback); },
    },
};

const tab = {
    tabName: 'curves',
    isDirty: false,
    needSave: false,
    dirty: { mixer: false, gain: false },
    selectedCategory: 'mixer',
    selectedCurve: 0,
};

tab.initialize = function (callback) {
    const self = this;

    function category() {
        return CATEGORIES[self.selectedCategory];
    }

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
        Promise.resolve(true)
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_CURVES))
            .then(() => MSP.promise(MSPCodes.MSP_GAIN_CURVES))
            .then(callback);
    }

    function save_data(callback) {
        const keys = Object.keys(CATEGORIES);

        function send_next(i) {
            if (i >= keys.length) {
                save_eeprom();
                return;
            }
            const key = keys[i];
            if (self.dirty[key])
                CATEGORIES[key].sendAll(() => send_next(i + 1));
            else
                send_next(i + 1);
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
            self.dirty = { mixer: false, gain: false };
            self.isDirty = false;
            callback?.();
        }

        send_next(0);
    }

    // Map between curve units and the SVG viewBox (0..400, y-flipped since
    // SVG y grows downward but a curve's y should grow up), using the
    // active category's own x/y ranges. Inset by PADDING so points at the
    // extreme corners aren't clipped by the viewBox edge (a point sitting
    // exactly on the boundary would only be half/quarter-visible, and
    // barely clickable).
    const PLOT_SIZE = 400;
    const PADDING = 20;
    const PLOT_INNER = PLOT_SIZE - PADDING * 2;

    function toSvgX(x) {
        const c = category();
        return PADDING + (x - c.xMin) / (c.xMax - c.xMin) * PLOT_INNER;
    }
    function toSvgY(y) {
        const c = category();
        return PADDING + PLOT_INNER - (y - c.yMin) / (c.yMax - c.yMin) * PLOT_INNER;
    }
    function fromSvgX(sx) {
        const c = category();
        return (sx - PADDING) / PLOT_INNER * (c.xMax - c.xMin) + c.xMin;
    }
    function fromSvgY(sy) {
        const c = category();
        return (PLOT_INNER - (sy - PADDING)) / PLOT_INNER * (c.yMax - c.yMin) + c.yMin;
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

        const cat = category();
        const model = cat.model;
        const curve = cat.getArray()[self.selectedCurve];

        updatePointCountSelect(curve);

        // Gridlines at 5 evenly spaced ticks per axis, bold line through
        // whichever tick is that axis's meaningful reference value (0 for
        // mixer curves, but the "no effect" value for gain curves is 100%,
        // not 0).
        ticks(cat.xMin, cat.xMax).forEach(function (v) {
            const vLine = ns('line');
            vLine.setAttribute('x1', toSvgX(v));
            vLine.setAttribute('x2', toSvgX(v));
            vLine.setAttribute('y1', 0);
            vLine.setAttribute('y2', PLOT_SIZE);
            vLine.setAttribute('class', v === cat.xAxisValue ? 'curveAxis' : 'curveGrid');
            svg.appendChild(vLine);
        });
        ticks(cat.yMin, cat.yMax).forEach(function (v) {
            const hLine = ns('line');
            hLine.setAttribute('y1', toSvgY(v));
            hLine.setAttribute('y2', toSvgY(v));
            hLine.setAttribute('x1', 0);
            hLine.setAttribute('x2', PLOT_SIZE);
            hLine.setAttribute('class', v === cat.yAxisValue ? 'curveAxis' : 'curveGrid');
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
            xInput.min = cat.xMin;
            xInput.max = cat.xMax;
            xInput.step = 10;

            const yInput = document.createElement('input');
            yInput.type = 'number';
            yInput.min = cat.yMin;
            yInput.max = cat.yMax;
            yInput.step = 10;

            [xInput, yInput].forEach(function (input) {
                const cell = document.createElement('td');
                cell.appendChild(input);
                row.appendChild(cell);
            });

            function commitFromInputs() {
                const clamped = model.clampPoint(
                    curve, index,
                    Math.round(parseFloat(xInput.value)) || 0,
                    Math.round(parseFloat(yInput.value)) || 0
                );
                Object.assign(curve.points[index], clamped);
                updateGeometry();
                self.dirty[self.selectedCategory] = true;
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
                if (model.removePoint(curve, index)) {
                    self.dirty[self.selectedCategory] = true;
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
                    const clamped = model.clampPoint(curve, index, Math.round(point.x), Math.round(point.y));
                    // Mutate in place (not curve.points[index] = clamped) so the
                    // activePoints slice - which shares the same point objects -
                    // stays in sync without needing a full re-render per frame.
                    Object.assign(curve.points[index], clamped);
                    updateGeometry();
                    showCoordLabel(clamped);
                    self.dirty[self.selectedCategory] = true;
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
                if (model.removePoint(curve, index)) {
                    self.dirty[self.selectedCategory] = true;
                    self.needSave = true;
                    setDirty();
                    renderCurveSvg();
                }
            });
        });

        svg.addEventListener('click', function (event) {
            if (event.target !== svg) return; // clicked a point, not the background
            const point = svgPointFromEvent(svg, event);
            if (model.addPoint(curve, Math.round(point.x), Math.round(point.y))) {
                self.dirty[self.selectedCategory] = true;
                self.needSave = true;
                setDirty();
                renderCurveSvg();
            }
        });
    }

    function selectCategory(key) {
        self.selectedCategory = key;
        self.selectedCurve = 0;

        $('.tab-curves .tab-container .tab').removeClass('active');
        $('.tab-curves .tab-container .' + CATEGORIES[key].tabClass).addClass('active');
        $('#curveTitle').text(i18n.getMessage(category().titleKey));
        $('#curveCategoryHelp').text(i18n.getMessage(category().helpKey));

        populateCurveSelect();
        renderCurveSvg();
    }

    function setupCategoryTabs() {
        Object.keys(CATEGORIES).forEach(function (key) {
            $('.tab-curves .tab-container .' + CATEGORIES[key].tabClass).on('click', function (event) {
                event.preventDefault();
                if (self.selectedCategory !== key)
                    selectCategory(key);
            });
        });
    }

    function populateCurveSelect() {
        const select = $('#curveSelect');
        select.empty();

        for (let i = 0; i < category().model.CURVE_COUNT; i++) {
            select.append($('<option></option>').attr('value', i).text(i18n.getMessage('mixerCurveLabel', [i + 1])));
        }

        select.val(self.selectedCurve);

        select.off('change').on('change', function () {
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

        for (let n = 2; n <= category().model.POINT_COUNT; n++) {
            select.append($('<option></option>').attr('value', n).text(n));
        }

        select.val(curve.count);
    }

    function process_html() {
        i18n.localizePage();

        Object.values(CATEGORIES).forEach(function (cat) {
            const arr = cat.getArray();
            while (arr.length < cat.model.CURVE_COUNT) {
                arr.push(cat.model.nullCurve());
            }
        });

        self.origCurves = {
            mixer: MixerCurve.cloneCurves(FC.MIXER_CURVES),
            gain: GainCurve.cloneCurves(FC.GAIN_CURVES),
        };
        self.isDirty = false;
        self.needSave = false;
        self.dirty = { mixer: false, gain: false };

        $('.tab-curves').addClass('toolbar_hidden');
        $('#curveTitle').text(i18n.getMessage(category().titleKey));
        $('#curveCategoryHelp').text(i18n.getMessage(category().helpKey));
        $('.tab-curves .tab-container .tab').removeClass('active');
        $('.tab-curves .tab-container .' + category().tabClass).addClass('active');

        setupCategoryTabs();
        populateCurveSelect();
        renderCurveSvg();

        self.save = function (callback) {
            save_data(callback);
        };

        self.revert = function (callback) {
            FC.MIXER_CURVES = self.origCurves.mixer;
            FC.GAIN_CURVES = self.origCurves.gain;
            self.needSave = false;
            save_data(callback);
        };

        $('.curveResetBtn').on('click', function (event) {
            event.preventDefault();
            const cat = category();
            cat.getArray()[self.selectedCurve] = cat.model.nullCurve();
            self.dirty[self.selectedCategory] = true;
            self.needSave = true;
            setDirty();
            renderCurveSvg();
        });

        $('.curveAddPointBtn').on('click', function (event) {
            event.preventDefault();
            const cat = category();
            const curve = cat.getArray()[self.selectedCurve];
            if (cat.model.addPointAtLargestGap(curve)) {
                self.dirty[self.selectedCategory] = true;
                self.needSave = true;
                setDirty();
                renderCurveSvg();
            }
        });

        $('#curvePointCountSelect').on('change', function () {
            const cat = category();
            const curve = cat.getArray()[self.selectedCurve];
            cat.model.setPointCount(curve, parseInt($(this).val(), 10));
            self.dirty[self.selectedCategory] = true;
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
