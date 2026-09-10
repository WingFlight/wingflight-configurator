<script>
  import Field from "@/components/Field.svelte";
  import Section from "@/components/Section.svelte";
  import SubSection from "@/components/SubSection.svelte";
  import Switch from "@/components/Switch.svelte";
  import Tier from "@/components/Tier.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";

  import motorState from "./state.svelte.js";

  async function enableHandler() {
    if (!motorState.overrideEnabled) {
      await mspHelper.resetMotorOverrides();
    }
  }
</script>

<Tier id="motors.override.enable">
  <Section label="motorOverrideTitle">
    <WarningNote message="motorOverrideNote" />
    <SubSection>
      <Field id="motor-override-enable" label="genericEnable">
        <Switch
          id="motor-override-enable"
          bind:checked={motorState.overrideEnabled}
          onchange={enableHandler}
        />
      </Field>
    </SubSection>
  </Section>
</Tier>

<style lang="scss">
</style>
