sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "ZE4_CC_COST/model/models",
    "sap/m/PageAccessibleLandmarkInfo"
], (UIComponent, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("ZE4_CC_COST.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");
            this.setModel(new JSONModel({
                defaults: {
                    bukrs: "0001",
                    gjahr: String(new Date().getFullYear()),
                    period: String(new Date().getMonth() + 1).padStart(2, "0"),
                    orgNodeId: "",
                    orgNodeText: "",
                    saknr: "",
                    waers: "KRW",
                    budgetVersion: "001"
                },
                filters: {
                    bukrs: "0001",
                    gjahr: String(new Date().getFullYear()),
                    period: String(new Date().getMonth() + 1).padStart(2, "0"),
                    orgNodeId: "",
                    orgNodeText: "",
                    saknr: "",
                    waers: "KRW",
                    budgetVersion: "001"
                },
                selectedOrg: {
                    childId: "",
                    nodeText: "",
                    descendantIds: []
                }
            }), "appState");

            // enable routing
            this.getRouter().initialize();
        }
    });
});
