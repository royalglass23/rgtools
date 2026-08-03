import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function pageSource() {
  return readFileSync(
    join(process.cwd(), "app/(dashboard)/admin/work-orders/page.tsx"),
    "utf8",
  );
}

function editorSource() {
  return readFileSync(
    join(process.cwd(), "modules/work-orders/SummaryFieldsEditor.tsx"),
    "utf8",
  );
}

function summaryConfigSource() {
  return readFileSync(
    join(process.cwd(), "modules/work-orders/summary-config.ts"),
    "utf8",
  );
}

function catalogueEditorSource() {
  return readFileSync(
    join(process.cwd(), "modules/work-orders/ProductionSpecificationCatalogueEditor.tsx"),
    "utf8",
  );
}

function specificationFiltersEditorSource() {
  return readFileSync(
    join(process.cwd(), "modules/work-orders/SpecificationFiltersEditor.tsx"),
    "utf8",
  );
}

describe("work order admin page", () => {
  it("lets admins deactivate controlled options instead of deleting them", () => {
    const source = pageSource();

    expect(source).toContain("deactivateWorkOrderInstallerAction");
    expect(source).toContain("deactivateWorkOrderStageAction");
    expect(source).toContain("deactivateWorkOrderHardwareStatusAction");
    expect(source).toContain("Deactivate");
    expect(source).not.toContain("Delete");
  });

  it("surfaces global summary configuration controls", () => {
    const source = `${pageSource()}\n${editorSource()}\n${summaryConfigSource()}`;

    expect(source).toContain("Work Order Summary Fields");
    expect(source).toContain("Maintenance Program");
    expect(source).toContain("Visible");
    expect(source).toContain("Filterable");
    expect(editorSource()).toContain(">Editable<");
    expect(editorSource()).toContain("canConfigureSummaryFieldAsEditable");
    expect(source).not.toContain("Display order");
    expect(source).toMatch(/params\?\.summarySaved === ["']1["']/);
    expect(source).toContain("Work Order summary fields saved.");
    expect(source.indexOf("Work Order summary fields saved.")).toBeLessThan(
      source.indexOf("Work Order Configuration"),
    );
  });

  it("reorders summary fields by dragging rows while preserving order form fields", () => {
    const source = editorSource();

    expect(source).toContain("draggable");
    expect(source).toContain("onDragStart");
    expect(source).toContain("onDrop");
    expect(source).toContain("name={`order:${field.id}`}");
    expect(source).not.toContain('type="number"');
  });

  it("lets configure users maintain billing-line exclusions for the next refresh", () => {
    const source = pageSource();

    expect(source).toContain("Billing line exclusions");
    expect(source).toContain("saveWorkOrderBillingExclusionsAction");
    expect(source).toContain("One case-insensitive term per line");
  });

  it("governs stable Specification Catalogue options with impact preview and explicit confirmation", () => {
    const source = `${pageSource()}\n${catalogueEditorSource()}`;

    expect(source).toContain("Specification Catalogue");
    expect(source).toContain("Production Label wording");
    expect(source).toContain("Aliases");
    expect(source).toContain("PS1");
    expect(source).toContain("PS3");
    expect(source).toContain("Not used for PS");
    expect(source).toContain("Affected confirmed items");
    expect(source).toContain("confirmImpact");
    expect(source).toContain("Saving catalogue option");
    expect(source).not.toContain("Delete catalogue option");
  });

  it("lets Configure users globally enable and order every Production Specification filter", () => {
    const source = `${pageSource()}\n${specificationFiltersEditorSource()}`;

    expect(source).toContain("Production Specification filters");
    expect(source).toContain("saveWorkOrderSpecificationFilterConfigAction");
    expect(source).toContain("DataPanel");
    expect(source).toContain("FeedbackState");
    expect(source).toContain("PrecisionButton");
    expect(source).toContain("Enable the canonical fields staff can filter by");
    expect(source).toContain('name={`enabled:${field.field}`}');
    expect(source).toContain('name={`order:${field.field}`}');
    expect(source).not.toContain("filter limit");
  });
});
