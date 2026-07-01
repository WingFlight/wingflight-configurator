export default class MixerWizardDialog {

    #dom = {
        dialog: null,
        buttonApply: null,
        buttonCancel: null,
        layoutRadios: null,
        aileronsSection: null,
        aileronsRadios: null,
        tailSection: null,
        tailRadios: null,
        wingYawSection: null,
        wingYawRadios: null,
        flapsCheckbox: null,
        motorsRadios: null,
        diffThrustSection: null,
        diffThrustCheckbox: null,
        previewContainer: null,
        previewLayers: null,
    };

    #onApplyCallback;

    constructor(domDialog, onApplyCallback) {
        this.#dom.dialog = domDialog;
        this.#onApplyCallback = onApplyCallback;
    }

    initialize() {
        return new Promise((resolve) => {
            this.#dom.dialog.load('/src/tabs/mixer_wizard_dialog.html', () => {
                this.#readDom();
                resolve();
            });
        });
    }

    open() {
        this.#resetForm();
        this.#dom.dialog[0].showModal();
    }

    #readDom() {
        i18n.localizePage();

        this.#dom.buttonApply = this.#dom.dialog.find('#mixerWizardApply');
        this.#dom.buttonCancel = this.#dom.dialog.find('#mixerWizardCancel');
        this.#dom.layoutRadios = this.#dom.dialog.find('input[name="wizardLayout"]');
        this.#dom.aileronsSection = this.#dom.dialog.find('.wizardAileronsSection');
        this.#dom.aileronsRadios = this.#dom.dialog.find('input[name="wizardAilerons"]');
        this.#dom.tailSection = this.#dom.dialog.find('.wizardTailSection');
        this.#dom.tailRadios = this.#dom.dialog.find('input[name="wizardTail"]');
        this.#dom.wingYawSection = this.#dom.dialog.find('.wizardWingYawSection');
        this.#dom.wingYawRadios = this.#dom.dialog.find('input[name="wizardWingYaw"]');
        this.#dom.flapsCheckbox = this.#dom.dialog.find('#wizardFlaps');
        this.#dom.motorsRadios = this.#dom.dialog.find('input[name="wizardMotors"]');
        this.#dom.diffThrustSection = this.#dom.dialog.find('.wizardDiffThrustSection');
        this.#dom.diffThrustCheckbox = this.#dom.dialog.find('#wizardDiffThrust');
        this.#dom.previewContainer = this.#dom.dialog.find('#wizardPreview');
        this.#dom.previewLayers = this.#dom.dialog.find('#wizardPreviewLayers');

        this.#dom.layoutRadios.on('change', () => this.#update());
        this.#dom.motorsRadios.on('change', () => this.#update());
        this.#dom.aileronsRadios.on('change', () => this.#updatePreview());
        this.#dom.tailRadios.on('change', () => this.#updatePreview());
        this.#dom.wingYawRadios.on('change', () => this.#updatePreview());
        this.#dom.flapsCheckbox.on('change', () => this.#updatePreview());
        this.#dom.buttonApply.on('click', (event) => {
            event.preventDefault();
            this.#onApply();
        });
        this.#dom.buttonCancel.on('click', (event) => {
            event.preventDefault();
            this.#dom.dialog[0].close();
        });
    }

    #update() {
        this.#updateVisibility();
        this.#updatePreview();
    }

    #updateVisibility() {
        const layout = this.#dom.layoutRadios.filter(':checked').val();
        const motors = this.#dom.motorsRadios.filter(':checked').val();

        this.#dom.aileronsSection.toggle(layout === 'conventional');
        this.#dom.tailSection.toggle(layout === 'conventional');
        this.#dom.wingYawSection.toggle(layout === 'flyingWing');
        this.#dom.diffThrustSection.toggle(motors === '2');
    }

    #updatePreview() {
        const options = this.#readOptions();

        this.#dom.previewContainer.show();

        const layers = [];

        if (options.layout === 'flyingWing') {
            layers.push('flying_wing_shape');
            layers.push('flying_wing_aileron');

            if (options.wingYaw === 'rudder') layers.push('flying_wing_rudder');
            if (options.flaps)               layers.push('flying_wing_flaps');
            if (options.motors === 1)        layers.push('flying_wing_one_motor');
            else if (options.motors === 2)   layers.push('flying_wing_two_motor');
        } else {
            layers.push('conventional_shape');

            if (options.ailerons !== 'none')              layers.push('conventional_aileron');
            if (options.tailControl === 'elevatorOnly')   layers.push('conventional_normal_tail_no_rudder');
            else if (options.tailControl === 'elevatorRudder') layers.push('conventional_normal_tail');
            else if (options.tailControl === 'vtail')     layers.push('conventional_v_tail');

            if (options.flaps)             layers.push('conventional_flaps');
            if (options.motors === 1)      layers.push('conventional_one_motor');
            else if (options.motors === 2) layers.push('conventional_dual_motor');
        }

        this.#dom.previewLayers.empty();
        for (const name of layers) {
            $('<img>')
                .attr('src', `/images/aircraft_shapes/${name}.svg`)
                .attr('alt', '')
                .attr('aria-hidden', 'true')
                .appendTo(this.#dom.previewLayers);
        }
    }

    #resetForm() {
        this.#dom.dialog.find('#wizardLayoutConventional').prop('checked', true);
        this.#dom.dialog.find('#wizardAileronsIndependent').prop('checked', true);
        this.#dom.dialog.find('#wizardTailElevatorRudder').prop('checked', true);
        this.#dom.dialog.find('#wizardWingYawRudder').prop('checked', true);
        this.#dom.flapsCheckbox.prop('checked', false);
        this.#dom.dialog.find('#wizardMotors1').prop('checked', true);
        this.#dom.diffThrustCheckbox.prop('checked', false);
        this.#update();
    }

    #readOptions() {
        return {
            layout: this.#dom.layoutRadios.filter(':checked').val(),
            ailerons: this.#dom.aileronsRadios.filter(':checked').val(),
            tailControl: this.#dom.tailRadios.filter(':checked').val(),
            wingYaw: this.#dom.wingYawRadios.filter(':checked').val(),
            flaps: this.#dom.flapsCheckbox.is(':checked'),
            motors: parseInt(this.#dom.motorsRadios.filter(':checked').val(), 10),
            diffThrustYaw: this.#dom.diffThrustCheckbox.is(':checked'),
        };
    }

    #onApply() {
        const options = this.#readOptions();
        this.#dom.dialog[0].close();
        this.#onApplyCallback?.(options);
    }
}
