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

        this.#dom.layoutRadios.on('change', () => this.#updateVisibility());
        this.#dom.motorsRadios.on('change', () => this.#updateVisibility());
        this.#dom.buttonApply.on('click', (event) => {
            event.preventDefault();
            this.#onApply();
        });
        this.#dom.buttonCancel.on('click', (event) => {
            event.preventDefault();
            this.#dom.dialog[0].close();
        });
    }

    #updateVisibility() {
        const layout = this.#dom.layoutRadios.filter(':checked').val();
        const motors = this.#dom.motorsRadios.filter(':checked').val();

        this.#dom.aileronsSection.toggle(layout === 'conventional');
        this.#dom.tailSection.toggle(layout === 'conventional');
        this.#dom.wingYawSection.toggle(layout === 'flyingWing');
        this.#dom.diffThrustSection.toggle(motors === '2');
    }

    #resetForm() {
        this.#dom.dialog.find('#wizardLayoutConventional').prop('checked', true);
        this.#dom.dialog.find('#wizardAileronsIndependent').prop('checked', true);
        this.#dom.dialog.find('#wizardTailElevatorRudder').prop('checked', true);
        this.#dom.dialog.find('#wizardWingYawRudder').prop('checked', true);
        this.#dom.flapsCheckbox.prop('checked', false);
        this.#dom.dialog.find('#wizardMotors1').prop('checked', true);
        this.#dom.diffThrustCheckbox.prop('checked', false);
        this.#updateVisibility();
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
