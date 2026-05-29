sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/viz/ui5/controls/common/feeds/FeedItem"
], (Controller, JSONModel, History, MessageBox, FlattenedDataset, FeedItem) => {
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
                to_Item: {
                    results: []
                },
                to_Reservation: {
                    results: []
                },
                reservationSummary: {
                    count: 0,
                    openQuantity: 0,
                    deletedCount: 0
                }
            });
            this.getView().setModel(oDetailModel, "detail");
        },

        _onRouteMatched(oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            const matnr = decodeURIComponent(oArgs.matnr);
            const gjahr = decodeURIComponent(oArgs.gjahr);
            const monat = decodeURIComponent(oArgs.monat);
            const kostl = decodeURIComponent(oArgs.kostl);

            this._loadDetailData(matnr, gjahr, monat, kostl);
        },

        _loadDetailData(matnr, gjahr, monat, kostl) {
            const oModel = this.getOwnerComponent().getModel();
            const oDetailModel = this.getView().getModel("detail");

            // Build the read request with $expand for related entities
            const sPath = "/" + oModel.createKey("zcds_e4_co_0010", {
                matnr,
                gjahr,
                monat,
                kostl
            });

            oModel.read(sPath, {
                urlParameters: {
                    $expand: "to_Item,to_Reservation"
                },
                success: (oData) => {
                    const aItems = this._getExpandedResults(oData.to_Item || oData._Item);
                    const aReservations = this._getExpandedResults(oData.to_Reservation || oData._Reservation);

                    oDetailModel.setData(Object.assign({}, oData, {
                        to_Item: {
                            results: aItems
                        },
                        to_Reservation: {
                            results: aReservations
                        },
                        reservationSummary: this._getReservationSummary(aReservations)
                    }));
                    this._initializeChart(aItems);
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
                if (oChart) {
                    oChart.destroyDataset();
                    oChart.removeAllFeeds();
                }
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
            oChart.removeAllFeeds();
            oChart.addFeed(new FeedItem({
                uid: "size",
                type: "Measure",
                values: ["Percentage"]
            }));
            oChart.addFeed(new FeedItem({
                uid: "color",
                type: "Dimension",
                values: ["Cost Component"]
            }));

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
                    position: "right"
                },
                title: {
                    visible: false
                }
            });
        },

        formatDeleteFlag(sValue) {
            return sValue === "X" ? "삭제됨" : "정상";
        },

        formatDeleteState(sValue) {
            return sValue === "X" ? "Error" : "Success";
        },

        formatAmount(vValue) {
            return this._formatNumber(vValue, 0);
        },

        formatQuantity(vValue) {
            return this._formatNumber(vValue, 3);
        },

        formatPercent(vValue) {
            return this._formatNumber(vValue, 2);
        },

        _formatNumber(vValue, iMaximumFractionDigits) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return "0";
            }

            const fValue = Number(vValue);
            if (Number.isNaN(fValue)) {
                return String(vValue);
            }

            return new Intl.NumberFormat("ko-KR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: iMaximumFractionDigits
            }).format(fValue);
        },

        _getExpandedResults(oNavigationData) {
            if (Array.isArray(oNavigationData)) {
                return oNavigationData;
            }

            return oNavigationData && Array.isArray(oNavigationData.results) ? oNavigationData.results : [];
        },

        _getReservationSummary(aReservations) {
            return aReservations.reduce((oSummary, oItem) => {
                oSummary.count += 1;
                oSummary.openQuantity += Number(oItem.resme || 0);
                if (oItem.loekz === "X") {
                    oSummary.deletedCount += 1;
                }
                return oSummary;
            }, {
                count: 0,
                openQuantity: 0,
                deletedCount: 0
            });
        },

        onReservationUpdateFinished(oEvent) {
            oEvent.getSource().getItems().forEach((oItem) => {
                const oContext = oItem.getBindingContext("detail");
                const bDeleted = oContext && oContext.getProperty("loekz") === "X";
                oItem.toggleStyleClass("reservationDeletedRow", bDeleted);
            });
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
