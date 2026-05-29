sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/viz/ui5/data/FlattenedDataset"
], (Controller, JSONModel, History, MessageBox, FlattenedDataset) => {
    "use strict";

    return Controller.extend("ze4.co.s.cost.ze4coscost.controller.StandardCostDetail", {
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteStandardCostDetail").attachPatternMatched(this._onRouteMatched, this);

            // Initialize detail model
            const oDetailModel = new JSONModel({
                matnr: "",
                maktx: "",
                mtbez: "",
                wgbez: "",
                total_cost: 0,
                waers: "USD",
                _Item: [],
                _Reservation: []
            });
            this.getView().setModel(oDetailModel, "detail");
        },

        _onRouteMatched(oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            const matnr = oArgs.matnr;
            const gjahr = oArgs.gjahr;
            const monat = oArgs.monat;
            const kostl = oArgs.kostl;

            this._loadDetailData(matnr, gjahr, monat, kostl);
        },

        _loadDetailData(matnr, gjahr, monat, kostl) {
            const oModel = this.getOwnerComponent().getModel();
            const oDetailModel = this.getView().getModel("detail");

            // Build the read request with $expand for related entities
            const sPath = `/zcds_e4_co_0010(matnr='${matnr}',gjahr='${gjahr}',monat='${monat}',kostl='${kostl}')`;

            oModel.read(sPath, {
                urlParameters: {
                    $expand: "_Item,_Reservation"
                },
                success: (oData) => {
                    oDetailModel.setData(oData);
                    this._initializeChart(oData._Item || []);
                },
                error: (oError) => {
                    MessageBox.error("상세 데이터 조회 실패");
                    console.error("Detail data load error:", oError);
                }
            });
        },

        _initializeChart(aCostItems) {
            const oChart = this.byId("costDonutChart");
            if (!oChart || !aCostItems || aCostItems.length === 0) {
                return;
            }

            // Prepare data for the chart
            const aChartData = aCostItems.map((item) => ({
                costComponent: item.cost_comp_text || "Unknown",
                percent: parseFloat(item.percent) || 0
            }));

            // Create FlattenedDataset
            const oDataset = new FlattenedDataset({
                dimensions: [
                    {
                        name: "Cost Component",
                        value: "{costComponent}"
                    }
                ],
                measures: [
                    {
                        name: "Percentage",
                        value: "{percent}"
                    }
                ],
                data: {
                    path: "/costData"
                }
            });

            oChart.setDataset(oDataset);

            // Set the model for chart data
            const oChartModel = new JSONModel({
                costData: aChartData
            });
            oChart.setModel(oChartModel);

            // Configure VizFrame properties
            oChart.setVizProperties({
                plotArea: {
                    dataLabel: {
                        visible: true,
                        formatString: "#0.00'%'"
                    }
                },
                legend: {
                    visible: true,
                    position: "bottom"
                },
                title: {
                    visible: false
                }
            });
        },

        formatDeleteFlag(sValue) {
            return sValue === "X" ? "삭제됨" : "정상";
        },

        onNavBack() {
            const oHistory = History.getInstance();
            const sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                const oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteStandardCost", {}, true);
            }
        }
    });
});
