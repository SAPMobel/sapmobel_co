sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/viz/ui5/controls/common/feeds/FeedItem"
], (Controller, JSONModel, ODataModel, Filter, FilterOperator, History, MessageBox, MessageToast, FlattenedDataset, FeedItem) => {
    "use strict";

    return Controller.extend("ze4.co.s.cost.ze4coscost.controller.StandardCostDetail", {
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteStandardCostDetail").attachPatternMatched(this._onRouteMatched, this);

            // Initialize detail model
            const oDetailModel = new JSONModel({
                matnr: "",
                maktx: "",
                mtopt: "",
                mtopt_t: "",
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
                to_SORequirement: {
                    results: []
                },
                to_BOMCostBreakdown: {
                    results: []
                },
                isFinishedProduct: false,
                isBomChart: false,
                reservationRows: [],
                reservationSummary: {
                    count: 0,
                    openQuantity: 0
                }
            });
            this.getView().setModel(oDetailModel, "detail");
        },

        _onRouteMatched(oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            const matnr = decodeURIComponent(oArgs.matnr);
            const gjahr = decodeURIComponent(oArgs.gjahr);
            const monat = decodeURIComponent(oArgs.monat);
            const mtopt = decodeURIComponent(oArgs.mtopt || "");

            this._loadDetailData(matnr, gjahr, monat, mtopt);
        },

        _loadDetailData(matnr, gjahr, monat, mtopt) {
            const oModel = this.getOwnerComponent().getModel();
            const oDetailModel = this.getView().getModel("detail");

            // Build the read request with $expand for related entities
            const sPath = "/" + oModel.createKey("zcds_e4_co_0010", {
                matnr,
                gjahr,
                monat,
                mtopt
            });

            oModel.read(sPath, {
                urlParameters: {
                    $expand: "to_Item,to_Reservation,to_SORequirement"
                },
                success: (oData) => {
                    const aItems = this._getExpandedResults(oData.to_Item || oData._Item);
                    const aReservations = this._getExpandedResults(oData.to_Reservation || oData._Reservation);
                    const aSORequirements = this._getExpandedResults(oData.to_SORequirement || oData._SORequirement);

                    this._applyDetailData(oData, aItems, aReservations, aSORequirements, []);
                    this._loadCostHistoryData(matnr, gjahr, monat, mtopt);

                    if (this._isFinishedProduct(oData)) {
                        this._loadBOMCostDataFromPP(oData);
                    }

                    if (this._isFinishedProduct(oData) && aSORequirements.length === 0 && Number(oData.total_resme || 0) > 0) {
                        this._loadSORequirementData(matnr, mtopt);
                    } else if (!this._isFinishedProduct(oData) && aReservations.length === 0 && Number(oData.total_resme || 0) > 0) {
                        this._loadReservationData(matnr);
                    }
                },
                error: (oError) => {
                    MessageBox.error("상세 데이터 조회 실패");
                    console.error("Detail data load error:", oError);
                }
            });
        },

        _applyDetailData(oData, aItems, aReservations, aSORequirements, aBOMCostBreakdown) {
            const oDetailModel = this.getView().getModel("detail");
            const aReservationRows = this._getReservationRows(oData, aReservations, aSORequirements);
            const aBOMRows = this._getUniqueBOMCostRows(aBOMCostBreakdown);
            const bFinishedProduct = this._isFinishedProduct(oData);

            oDetailModel.setData(Object.assign({}, oDetailModel.getData(), oData, {
                to_Item: {
                    results: aItems
                },
                to_Reservation: {
                    results: aReservations
                },
                to_SORequirement: {
                    results: aSORequirements
                },
                to_BOMCostBreakdown: {
                    results: aBOMRows
                },
                isFinishedProduct: bFinishedProduct,
                isBomChart: false,
                reservationRows: aReservationRows,
                reservationSummary: this._getReservationSummary(aReservationRows)
            }));
            this.byId("breakdownGrid").toggleStyleClass("bomHidden", !bFinishedProduct);
            this._initializeChart(aItems);
        },

        _loadCostHistoryData(matnr, gjahr, monat, mtopt) {
            const oModel = this.getOwnerComponent().getModel();
            const iEndYear = Number(gjahr);
            const iStartYear = iEndYear - 10;

            this._initializeCostHistoryChart([], gjahr, monat);

            oModel.read("/zcds_e4_co_0010", {
                filters: [
                    new Filter("matnr", FilterOperator.EQ, matnr),
                    new Filter("mtopt", FilterOperator.EQ, mtopt),
                    new Filter("gjahr", FilterOperator.GE, String(iStartYear))
                ],
                urlParameters: {
                    $select: "matnr,gjahr,monat,mtopt,total_cost,waers",
                    $orderby: "gjahr asc,monat asc"
                },
                success: (oData) => {
                    const aRows = this._getRecentCostHistoryRows(oData.results || [], gjahr, monat);
                    this._initializeCostHistoryChart(aRows, gjahr, monat);
                },
                error: (oError) => {
                    console.error("Cost history load error:", oError);
                    this._initializeCostHistoryChart([], gjahr, monat);
                }
            });
        },

        _loadReservationData(matnr) {
            const oModel = this.getOwnerComponent().getModel();
            const oDetailModel = this.getView().getModel("detail");

            oModel.read("/zcds_e4_co_0013", {
                filters: [
                    new Filter("matnr", FilterOperator.EQ, matnr)
                ],
                success: (oData) => {
                    const aReservations = oData.results || [];
                    const aReservationRows = this._normalizeMMReservations(aReservations);
                    oDetailModel.setProperty("/to_Reservation/results", aReservations);
                    oDetailModel.setProperty("/reservationRows", aReservationRows);
                    oDetailModel.setProperty("/reservationSummary", this._getReservationSummary(aReservationRows));
                },
                error: (oError) => {
                    console.error("Reservation fallback load error:", oError);
                }
            });
        },

        _loadSORequirementData(matnr, mtopt) {
            const oModel = this.getOwnerComponent().getModel();
            const oDetailModel = this.getView().getModel("detail");

            oModel.read("/zcds_e4_sd_0007", {
                filters: [
                    new Filter("matnr", FilterOperator.EQ, matnr),
                    new Filter("mtopt", FilterOperator.EQ, mtopt)
                ],
                success: (oData) => {
                    const aSORequirements = oData.results || [];
                    const aReservationRows = this._normalizeSORequirements(aSORequirements);
                    oDetailModel.setProperty("/to_SORequirement/results", aSORequirements);
                    oDetailModel.setProperty("/reservationRows", aReservationRows);
                    oDetailModel.setProperty("/reservationSummary", this._getReservationSummary(aReservationRows));
                },
                error: (oError) => {
                    console.error("SO requirement fallback load error:", oError);
                }
            });
        },

        _loadBOMCostDataFromPP(oDetail) {
            this._readPPBOMHeaders(oDetail)
                .then((aHeaders) => this._readPPBOMItems(aHeaders)
                    .then((aItems) => this._buildBOMCostRowsFromPP(aItems, oDetail)))
                .then((aBOMRows) => {
                    this._setBOMCostRows(aBOMRows);
                })
                .catch((oError) => {
                    console.warn("PP BOM cost data load failed.", oError);
                    this._setBOMCostRows([]);
                });
        },

        _readPPBOMHeaders(oDetail) {
            const aFilters = [
                new Filter("Matnr", FilterOperator.EQ, oDetail.matnr),
                new Filter("Mtopt", FilterOperator.EQ, oDetail.mtopt)
            ];
            const mParameters = {
                filters: aFilters,
                urlParameters: {
                    $select: "Matnr,Werks,Stlty,Stlan,Stlnr,Stlal,Mtopt,Bmeng,Bmein",
                    $orderby: "Stlty asc,Stlnr asc,Stlal asc"
                }
            };

            return this._readFirstAvailableEntitySet(this._getPPBOMHeaderService(), ["zcds_e4_pp_0003", "ZCDS_E4_PP_0003"], mParameters, "PP_0003")
                .then((aRows) => this._selectBOMHeaders(aRows, oDetail))
                .then((aRows) => this._getUniqueRows(aRows, (oItem) => [
                    this._readValue(oItem, "Matnr", "matnr"),
                    this._readValue(oItem, "Mtopt", "mtopt"),
                    this._readValue(oItem, "Werks", "werks"),
                    this._readValue(oItem, "Stlan", "stlan"),
                    this._readValue(oItem, "Stlty", "stlty"),
                    this._readValue(oItem, "Stlnr", "stlnr"),
                    this._readValue(oItem, "Stlal", "stlal")
                ].join("|")));
        },

        _selectBOMHeaders(aRows, oDetail) {
            const aOptionRows = (aRows || []).filter((oItem) => (
                this._readValue(oItem, "Matnr", "matnr") === oDetail.matnr
                && this._readValue(oItem, "Mtopt", "mtopt") === oDetail.mtopt
            ));
            const aPreferredRows = aOptionRows.filter((oItem) => (
                this._normalizeCode(this._readValue(oItem, "Stlan", "stlan")) === "1"
                && this._normalizeCode(this._readValue(oItem, "Stlty", "stlty")) === "M"
                && this._normalizeCode(this._readValue(oItem, "Werks", "werks")) === "0100"
            ));

            if (aPreferredRows.length > 0) {
                return aPreferredRows;
            }

            if (aOptionRows.length > 0) {
                console.warn("Preferred BOM header was not found. Using BOM headers for the selected material option.", {
                    expected: {
                        Matnr: oDetail.matnr,
                        Mtopt: oDetail.mtopt,
                        Stlan: "1",
                        Stlty: "M",
                        Werks: "0100"
                    },
                    candidates: aOptionRows.map((oItem) => ({
                        Matnr: this._readValue(oItem, "Matnr", "matnr"),
                        Mtopt: this._readValue(oItem, "Mtopt", "mtopt"),
                        Werks: this._readValue(oItem, "Werks", "werks"),
                        Stlan: this._readValue(oItem, "Stlan", "stlan"),
                        Stlty: this._readValue(oItem, "Stlty", "stlty"),
                        Stlnr: this._readValue(oItem, "Stlnr", "stlnr"),
                        Stlal: this._readValue(oItem, "Stlal", "stlal")
                    }))
                });
            }

            return aOptionRows;
        },

        _readPPBOMItems(aHeaders) {
            if (!aHeaders.length) {
                return Promise.resolve([]);
            }

            const oBOMService = this._getPPBOMHeaderService();
            const aReads = aHeaders.map((oHeader) => {
                const aFilters = [
                    new Filter("Stlty", FilterOperator.EQ, this._readValue(oHeader, "Stlty", "stlty")),
                    new Filter("Stlnr", FilterOperator.EQ, this._readValue(oHeader, "Stlnr", "stlnr")),
                    new Filter("Stlal", FilterOperator.EQ, this._readValue(oHeader, "Stlal", "stlal"))
                ];
                const mParameters = {
                    filters: aFilters,
                    urlParameters: {
                        $select: "Stlty,Stlnr,Stlal,Stlkn,Posnr,Idnrk,Idnrk_txt,Menge,Meins",
                        $orderby: "Posnr asc,Stlkn asc"
                    }
                };

                return this._readFirstAvailableEntitySet(oBOMService, ["ZCDS_E4_PP_0001", "zcds_e4_pp_0001"], mParameters, "PP_0001")
                    .then((aItems) => aItems.map((oItem) => Object.assign({}, oItem, {
                        _bomHeader: oHeader
                    })));
            });

            return Promise.all(aReads).then((aResultSets) => this._getUniqueRows(
                aResultSets.reduce((aResult, aRows) => aResult.concat(aRows), []),
                (oItem) => [
                    this._readValue(oItem, "Stlty", "stlty"),
                    this._readValue(oItem, "Stlnr", "stlnr"),
                    this._readValue(oItem, "Stlal", "stlal"),
                    this._readValue(oItem, "Stlkn", "stlkn"),
                    this._readValue(oItem, "Idnrk", "idnrk")
                ].join("|")
            ));
        },

        _buildBOMCostRowsFromPP(aItems, oDetail) {
            if (!aItems.length) {
                return Promise.resolve([]);
            }

            const aComponentNumbers = this._getUniqueRows(aItems.map((oItem) => ({
                matnr: this._readValue(oItem, "Idnrk", "idnrk")
            })).filter((oItem) => !!oItem.matnr), (oItem) => oItem.matnr).map((oItem) => oItem.matnr);

            return this._readComponentStandardCosts(aComponentNumbers, oDetail)
                .then((mCostByMaterial) => aItems.map((oItem) => {
                    const oHeader = oItem._bomHeader || {};
                    const sComponent = this._readValue(oItem, "Idnrk", "idnrk");
                    const fMenge = Number(this._readValue(oItem, "Menge", "menge") || 0);
                    const fBmeng = Number(this._readValue(oHeader, "Bmeng", "bmeng") || 1);
                    const fQuantityPerUnit = fBmeng ? fMenge / fBmeng : fMenge;
                    const oCost = mCostByMaterial[sComponent] || {};
                    const fUnitCost = Number(oCost.total_cost || 0);

                    return {
                        idnrk: sComponent,
                        maktx: this._readValue(oItem, "Idnrk_txt", "idnrk_txt"),
                        posnr: this._readValue(oItem, "Posnr", "posnr"),
                        menge: fMenge,
                        meins: this._readValue(oItem, "Meins", "meins"),
                        bmeng: fBmeng,
                        bmein: this._readValue(oHeader, "Bmein", "bmein"),
                        comp_unit_cost: fUnitCost,
                        waers: oCost.waers || oDetail.waers,
                        comp_total_cost: fUnitCost * fQuantityPerUnit
                    };
                }));
        },

        _readComponentStandardCosts(aComponentNumbers, oDetail) {
            if (!aComponentNumbers.length) {
                return Promise.resolve({});
            }

            const aMaterialFilters = aComponentNumbers.map((sMatnr) => new Filter("matnr", FilterOperator.EQ, sMatnr));
            const aFilters = [
                new Filter("gjahr", FilterOperator.EQ, oDetail.gjahr),
                new Filter("monat", FilterOperator.EQ, oDetail.monat),
                new Filter("mtopt", FilterOperator.EQ, "OP00"),
                new Filter({
                    filters: aMaterialFilters,
                    and: false
                })
            ];

            return this._readODataList("/zcds_e4_co_0010", {
                filters: aFilters,
                urlParameters: {
                    $select: "matnr,total_cost,waers"
                }
            }).then((aRows) => aRows.reduce((mResult, oItem) => {
                mResult[oItem.matnr] = oItem;
                return mResult;
            }, {}));
        },

        _setBOMCostRows(aRows) {
            this.getView().getModel("detail").setProperty("/to_BOMCostBreakdown/results", this._getUniqueBOMCostRows(aRows || []));
        },

        _getPPBOMHeaderService() {
            if (!this._oPPBOMHeaderService) {
                this._oPPBOMHeaderService = new ODataModel("/sap/opu/odata/sap/ZCDS_E4_PP_0003_CDS/", {
                    defaultBindingMode: "None",
                    useBatch: false
                });
            }

            return this._oPPBOMHeaderService;
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

            const aChartData = aCostItems.map((item) => ({
                label: item.cost_comp_text || "Unknown",
                value: parseFloat(item.percent) || 0
            })).filter((oItem) => oItem.value > 0);

            this.getView().getModel("detail").setProperty("/isBomChart", false);
            this._renderDonutChart(aChartData, "비율", true);
        },

        _initializeBomChart(aBOMRows) {
            const aChartData = this._getBOMMaterialChartData(aBOMRows);

            if (aChartData.length === 0) {
                return;
            }

            this.getView().getModel("detail").setProperty("/isBomChart", true);
            this._renderDonutChart(aChartData, "비율", false);
        },

        _renderDonutChart(aChartData, sMeasureName, bPercentLabel) {
            const oChart = this.byId("costDonutChart");
            if (!oChart) {
                return;
            }

            const oChartModel = new JSONModel({
                costData: aChartData
            });
            oChart.setModel(oChartModel, "chart");

            // Create FlattenedDataset
            const oDataset = new FlattenedDataset({
                dimensions: [
                    {
                        name: "구분",
                        value: "{chart>label}"
                    }
                ],
                measures: [
                    {
                        name: sMeasureName,
                        value: "{chart>value}"
                    }
                ],
                data: {
                    path: "chart>/costData"
                }
            });

            oChart.setDataset(oDataset);
            oChart.removeAllFeeds();
            oChart.addFeed(new FeedItem({
                uid: "size",
                type: "Measure",
                values: [sMeasureName]
            }));
            oChart.addFeed(new FeedItem({
                uid: "color",
                type: "Dimension",
                values: ["구분"]
            }));

            oChart.setVizProperties({
                plotArea: {
                    dataLabel: {
                        visible: bPercentLabel,
                        formatString: bPercentLabel ? "#0.00'%'" : "#,##0"
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

        onCostChartSelect(oEvent) {
            const oDetailModel = this.getView().getModel("detail");
            if (oDetailModel.getProperty("/isBomChart") || !oDetailModel.getProperty("/isFinishedProduct")) {
                return;
            }

            const aSelection = oEvent.getParameter("data") || [];
            const oSelectionData = aSelection[0] && aSelection[0].data;
            const sSelectedLabel = oSelectionData && oSelectionData["구분"];

            if (String(sSelectedLabel || "").indexOf("재료") === -1) {
                return;
            }

            this._initializeBomChart(oDetailModel.getProperty("/to_BOMCostBreakdown/results") || []);
        },

        onResetCostChart() {
            const oDetailModel = this.getView().getModel("detail");
            this._initializeChart(oDetailModel.getProperty("/to_Item/results") || []);
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

        formatBomComponentQuantity(vMenge, vBmeng) {
            const fMenge = Number(vMenge || 0);
            const fBmeng = Number(vBmeng || 0);

            if (!fBmeng) {
                return this.formatQuantity(fMenge);
            }

            return this.formatQuantity(fMenge / fBmeng);
        },

        formatBomComponentName(sMaktx, sMatnr) {
            return sMaktx || sMatnr || "-";
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

            if (oNavigationData && Array.isArray(oNavigationData.results)) {
                return oNavigationData.results;
            }

            if (oNavigationData && !oNavigationData.__deferred) {
                return [oNavigationData];
            }

            return [];
        },

        _readODataList(sPath, mParameters, oModel) {
            const oReadModel = oModel || this.getOwnerComponent().getModel();

            return new Promise((resolve, reject) => {
                oReadModel.read(sPath, Object.assign({}, mParameters, {
                    success: (oData) => {
                        resolve(oData && oData.results || []);
                    },
                    error: reject
                }));
            });
        },

        _readFirstAvailableEntitySet(oModel, aCandidateNames, mParameters, sEntityHint) {
            return this._resolveEntitySetPath(oModel, aCandidateNames, sEntityHint)
                .then((sPath) => this._readODataList(sPath, mParameters, oModel))
                .catch((oError) => {
                    console.warn("OData entity set resolution/read failed.", {
                        hint: sEntityHint,
                        candidates: aCandidateNames,
                        availableEntitySets: this._getEntitySetNamesFromMetadata(oModel),
                        error: oError
                    });

                    throw oError;
                });
        },

        _resolveEntitySetPath(oModel, aCandidateNames, sEntityHint) {
            const fnResolve = () => {
                const aEntitySetNames = this._getEntitySetNamesFromMetadata(oModel);
                const aLowerCandidateNames = aCandidateNames.map((sName) => String(sName).toLowerCase());
                const sExactMatch = aEntitySetNames.find((sName) => (
                    aLowerCandidateNames.indexOf(String(sName).toLowerCase()) !== -1
                ));

                if (sExactMatch) {
                    return "/" + sExactMatch;
                }

                const sNormalizedHint = String(sEntityHint || "").replace(/_/g, "").toLowerCase();
                const sHintMatch = aEntitySetNames.find((sName) => (
                    String(sName).replace(/_/g, "").toLowerCase().indexOf(sNormalizedHint) !== -1
                ));

                if (sHintMatch) {
                    return "/" + sHintMatch;
                }

                throw new Error("EntitySet not found in service metadata.");
            };

            if (oModel && oModel.metadataLoaded) {
                return oModel.metadataLoaded().then(fnResolve);
            }

            return Promise.resolve(fnResolve());
        },

        _getEntitySetNamesFromMetadata(oModel) {
            const oMetadata = oModel && oModel.getServiceMetadata && oModel.getServiceMetadata();
            const aSchemas = oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema || [];

            return aSchemas.reduce((aResult, oSchema) => {
                const aContainers = oSchema.entityContainer || [];

                aContainers.forEach((oContainer) => {
                    (oContainer.entitySet || []).forEach((oEntitySet) => {
                        if (oEntitySet.name) {
                            aResult.push(oEntitySet.name);
                        }
                    });
                });

                return aResult;
            }, []);
        },

        _readFirstAvailableList(oModel, aPaths, mParameters) {
            const aRemainingPaths = aPaths.slice();
            const fnTryNextPath = () => {
                const sPath = aRemainingPaths.shift();

                if (!sPath) {
                    return Promise.reject(new Error("No available OData entity set found."));
                }

                return this._readODataList(sPath, mParameters, oModel).catch((oError) => {
                    if (aRemainingPaths.length === 0) {
                        throw oError;
                    }

                    return fnTryNextPath();
                });
            };

            return fnTryNextPath();
        },

        _readValue(oItem) {
            const aNames = Array.prototype.slice.call(arguments, 1);

            for (let i = 0; i < aNames.length; i += 1) {
                if (oItem && oItem[aNames[i]] !== undefined && oItem[aNames[i]] !== null) {
                    return oItem[aNames[i]];
                }
            }

            return "";
        },

        _normalizeCode(sValue) {
            return String(sValue || "").trim().toUpperCase();
        },

        _getUniqueRows(aRows, fnGetKey) {
            const mSeen = {};

            return (aRows || []).reduce((aResult, oItem) => {
                const sKey = fnGetKey(oItem);

                if (!sKey || mSeen[sKey]) {
                    return aResult;
                }

                mSeen[sKey] = true;
                aResult.push(oItem);
                return aResult;
            }, []);
        },

        _getUniqueBOMCostRows(aRows) {
            return this._getUniqueRows(aRows, (oItem) => [
                this._readValue(oItem, "idnrk", "Idnrk"),
                this._readValue(oItem, "gjahr", "Gjahr"),
                this._readValue(oItem, "monat", "Monat"),
                this._readValue(oItem, "posnr", "Posnr")
            ].join("|"));
        },

        _getBOMMaterialChartData(aRows) {
            const mComponentCost = {};

            (aRows || []).forEach((oItem) => {
                const sLabel = this.formatBomComponentName(oItem.maktx, oItem.idnrk);
                const fCost = Number(oItem.comp_total_cost || 0);

                if (!fCost) {
                    return;
                }

                mComponentCost[sLabel] = (mComponentCost[sLabel] || 0) + fCost;
            });

            const fTotalComponentCost = Object.keys(mComponentCost).reduce((fTotal, sLabel) => (
                fTotal + mComponentCost[sLabel]
            ), 0);

            if (!fTotalComponentCost) {
                return [];
            }

            return Object.keys(mComponentCost)
                .sort((sLeft, sRight) => mComponentCost[sRight] - mComponentCost[sLeft])
                .map((sLabel) => ({
                    label: sLabel,
                    value: (mComponentCost[sLabel] / fTotalComponentCost) * 100
                }));
        },

        _getRecentCostHistoryRows(aRows, gjahr, monat) {
            const iEndYear = Number(gjahr);
            const iEndMonth = Number(monat);
            const iEndPeriod = iEndYear * 100 + iEndMonth;
            const iStartDate = new Date(iEndYear, iEndMonth - 120, 1);
            const iStartPeriod = iStartDate.getFullYear() * 100 + iStartDate.getMonth() + 1;

            return (aRows || [])
                .filter((oItem) => {
                    const iPeriod = Number(oItem.gjahr) * 100 + Number(oItem.monat);
                    return iPeriod >= iStartPeriod && iPeriod <= iEndPeriod;
                })
                .sort((oLeft, oRight) => {
                    const iLeft = Number(oLeft.gjahr) * 100 + Number(oLeft.monat);
                    const iRight = Number(oRight.gjahr) * 100 + Number(oRight.monat);
                    return iLeft - iRight;
                });
        },

        _initializeCostHistoryChart(aRows, gjahr, monat) {
            const oChart = this.byId("costHistoryLineChart");
            if (!oChart) {
                return;
            }

            const aChartData = this._getCostHistoryChartData(aRows, gjahr, monat);

            if (aChartData.length === 0) {
                oChart.destroyDataset();
                oChart.removeAllFeeds();
                return;
            }

            const oChartModel = new JSONModel({
                costHistory: aChartData
            });
            oChart.setModel(oChartModel, "history");

            this._configureCostHistoryViz(oChart);

            oChart.setVizProperties({
                plotArea: {
                    dataLabel: {
                        visible: true,
                        formatString: "#,##0"
                    },
                    marker: {
                        visible: true
                    },
                    interpolation: "monotone",
                    line: {
                        width: 3
                    }
                },
                interaction: {
                    selectability: {
                        mode: "SINGLE"
                    }
                },
                tooltip: {
                    visible: true
                },
                categoryAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        visible: true,
                        hideWhenOverlap: true
                    }
                },
                valueAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        formatString: "#,##0"
                    }
                },
                legend: {
                    visible: false
                },
                title: {
                    visible: false
                }
            });
        },

        onCostHistorySelect(oEvent) {
            const aSelection = oEvent.getParameter("data") || [];
            const oSelectionData = aSelection[0] && aSelection[0].data;

            if (!oSelectionData) {
                return;
            }

            const sPeriod = oSelectionData["기간"];
            const vCost = oSelectionData["표준단가"];
            const oChartModel = this.byId("costHistoryLineChart").getModel("history");
            const aRows = oChartModel && oChartModel.getProperty("/costHistory") || [];
            const oRow = aRows.find((oItem) => oItem.period === sPeriod) || {};
            const sCurrency = oRow.waers || this.getView().getModel("detail").getProperty("/waers") || "";

            MessageToast.show(sPeriod + " 표준단가: " + this.formatAmount(vCost) + " " + sCurrency);
        },

        _configureCostHistoryViz(oVizControl) {
            const oDataset = new FlattenedDataset({
                dimensions: [
                    {
                        name: "기간",
                        value: "{history>period}"
                    }
                ],
                measures: [
                    {
                        name: "표준단가",
                        value: "{history>cost}"
                    }
                ],
                data: {
                    path: "history>/costHistory"
                }
            });

            oVizControl.setDataset(oDataset);
            oVizControl.removeAllFeeds();
            oVizControl.addFeed(new FeedItem({
                uid: "valueAxis",
                type: "Measure",
                values: ["표준단가"]
            }));
            oVizControl.addFeed(new FeedItem({
                uid: "categoryAxis",
                type: "Dimension",
                values: ["기간"]
            }));
        },

        _getCostHistoryChartData(aRows, gjahr, monat) {
            const aMonths = this._getMonthRange(gjahr, monat, 120);
            const mRowsByPeriod = {};

            (aRows || []).forEach((oItem) => {
                const sPeriod = this._getPeriodKey(oItem.gjahr, oItem.monat);
                const fCost = Number(oItem.total_cost || 0);

                if (!fCost) {
                    return;
                }

                mRowsByPeriod[sPeriod] = {
                    cost: fCost,
                    waers: oItem.waers || ""
                };
            });

            return aMonths.reduce((aChartData, oMonth) => {
                const oRow = mRowsByPeriod[oMonth.period];

                if (!oRow) {
                    return aChartData;
                }

                if (!this._isHistoryDisplayMonth(oMonth, gjahr, monat)) {
                    return aChartData;
                }

                aChartData.push({
                    period: oMonth.gjahr + "." + oMonth.monat,
                    cost: oRow.cost,
                    waers: oRow.waers
                });
                return aChartData;
            }, []);
        },

        _isHistoryDisplayMonth(oMonth, gjahr, monat) {
            return oMonth.monat === "06"
                || oMonth.monat === "12"
                || (oMonth.gjahr === String(gjahr) && oMonth.monat === String(monat).padStart(2, "0"));
        },

        _getMonthRange(gjahr, monat, iCount) {
            const iEndYear = Number(gjahr);
            const iEndMonthIndex = Number(monat) - 1;
            const aMonths = [];

            for (let i = iCount - 1; i >= 0; i -= 1) {
                const oDate = new Date(iEndYear, iEndMonthIndex - i, 1);
                const sYear = String(oDate.getFullYear());
                const sMonth = String(oDate.getMonth() + 1).padStart(2, "0");

                aMonths.push({
                    gjahr: sYear,
                    monat: sMonth,
                    period: this._getPeriodKey(sYear, sMonth)
                });
            }

            return aMonths;
        },

        _getPeriodKey(gjahr, monat) {
            return String(gjahr) + String(monat).padStart(2, "0");
        },

        _getReservationRows(oData, aReservations, aSORequirements) {
            return this._isFinishedProduct(oData)
                ? this._normalizeSORequirements(aSORequirements)
                : this._normalizeMMReservations(aReservations);
        },

        _isFinishedProduct(oData) {
            return String(oData.mtart || "").toUpperCase() === "FERT";
        },

        _normalizeMMReservations(aReservations) {
            return aReservations.map((oItem) => ({
                source: "MM",
                document: oItem.banfn || "-",
                item: oItem.rsnum || "-",
                reservationQuantity: oItem.resme,
                meins: oItem.meins,
                statusText: oItem.loekz === "X" ? "삭제됨" : "정상",
                statusState: oItem.loekz === "X" ? "Error" : "Success",
                inactive: oItem.loekz === "X"
            }));
        },

        _normalizeSORequirements(aSORequirements) {
            return aSORequirements.map((oItem) => ({
                source: "SD",
                document: oItem.vbeln || "-",
                item: oItem.posnr || "-",
                reservationQuantity: oItem.bdmng,
                meins: oItem.meins,
                statusText: this._formatSOStatus(oItem.gbstk),
                statusState: oItem.gbstk === "04" ? "Information" : "Success",
                inactive: false
            }));
        },

        _formatSOStatus(sStatus) {
            if (sStatus === "03") {
                return "예약";
            }

            if (sStatus === "04") {
                return "출하준비";
            }

            return sStatus || "-";
        },

        _getReservationSummary(aReservationRows) {
            return aReservationRows.reduce((oSummary, oItem) => {
                oSummary.count += 1;
                oSummary.openQuantity += Number(oItem.reservationQuantity || 0);
                return oSummary;
            }, {
                count: 0,
                openQuantity: 0
            });
        },

        onReservationUpdateFinished(oEvent) {
            oEvent.getSource().getItems().forEach((oItem) => {
                const oContext = oItem.getBindingContext("detail");
                const bDeleted = oContext && oContext.getProperty("inactive");
                oItem.toggleStyleClass("reservationDeletedRow", bDeleted);
            });
        },

        onExportDetailToPdf() {
            const oDetailModel = this.getView().getModel("detail");
            const oDetail = oDetailModel.getData();

            if (!oDetail || !oDetail.matnr) {
                MessageBox.warning("출력할 상세 데이터가 없습니다.");
                return;
            }

            const sTitle = "[EverNiture-CO] 원가요소 세부 정보";
            const sCostDonutSvg = this._getVizSvgMarkup("costDonutChart");
            const sHistorySvg = this._getVizSvgMarkup("costHistoryLineChart");
            const aCostItems = oDetail.to_Item && oDetail.to_Item.results || [];
            const aBOMRows = oDetail.to_BOMCostBreakdown && oDetail.to_BOMCostBreakdown.results || [];
            const aReservationRows = oDetail.reservationRows || [];
            const aHistoryRows = this.byId("costHistoryLineChart").getModel("history") &&
                this.byId("costHistoryLineChart").getModel("history").getProperty("/costHistory") || [];
            const sPrintCss = [
                "<style>",
                "@page { size: A4 landscape; margin: 8mm; }",
                "* { box-sizing: border-box; }",
                "html, body { margin: 0; padding: 0; background: #fff; }",
                "body { font-family: Arial, 'Malgun Gothic', sans-serif; color: #1d2b3a; font-size: 10px; }",
                ".pdfMeta { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; border-bottom: 2px solid #d9e1e8; padding-bottom: 8px; color: #526376; }",
                "h1 { margin: 0; font-size: 18px; color: #0b1f3a; } h2 { margin: 0 0 8px; font-size: 13px; color: #0b1f3a; }",
                ".section { border: 1px solid #dfe7ef; border-radius: 4px; padding: 10px; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }",
                ".summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }",
                ".item { border-right: 1px solid #dfe7ef; min-height: 34px; } .item:last-child { border-right: 0; }",
                ".label { color: #5b6b7f; font-weight: 700; margin-bottom: 3px; } .value { font-size: 12px; font-weight: 700; color: #0a6ed1; } .sub { color: #5b6b7f; }",
                ".total { background: #0a6ed1; color: #fff; border-radius: 4px; padding: 8px 10px; } .total .label, .total .sub, .total .value { color: #fff; }",
                ".grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }",
                "table { width: 100%; border-collapse: collapse; table-layout: fixed; } th, td { border-bottom: 1px solid #dfe5eb; padding: 5px 6px; vertical-align: middle; word-break: keep-all; } th { background: #f4f7fa; font-weight: 700; text-align: left; } td.num, th.num { text-align: right; white-space: nowrap; } td.center, th.center { text-align: center; white-space: nowrap; }",
                ".chartBox { min-height: 340px; overflow: visible; } .chartBox svg { display: block; width: 100%; height: 310px; overflow: visible; }",
                ".historyBox { min-height: 300px; overflow: visible; } .historyBox svg { display: block; width: 100%; height: 260px; overflow: visible; }",
                "@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }",
                "</style>"
            ].join("");
            const sHtml = [
                "<!DOCTYPE html>",
                "<html><head><meta charset='UTF-8'/>",
                "<title>" + sTitle + "</title>",
                sPrintCss,
                "</head><body>",
                "<div class='pdfMeta'><h1>" + sTitle + "</h1><span>생성일시: " + this._escapeHtml(new Date().toLocaleString("ko-KR")) + "</span></div>",
                this._buildDetailPdfSummary(oDetail),
                "<div class='grid'>",
                this._buildDetailPdfCostTable(aCostItems),
                "<section class='section chartBox'><h2>" + this._escapeHtml(oDetail.isBomChart ? "재료비 세부 비중" : "원가 구조 비중") + "</h2>" + (sCostDonutSvg || "<p>차트 데이터가 없습니다.</p>") + "</section>",
                "</div>",
                oDetail.isFinishedProduct ? this._buildDetailPdfBOMTable(aBOMRows) : "",
                "<section class='section historyBox'><h2>최근 10년 표준단가 흐름</h2>" + (sHistorySvg || this._buildDetailPdfHistoryTable(aHistoryRows)) + "</section>",
                this._buildDetailPdfReservationSummary(oDetail.reservationSummary, aReservationRows),
                "</body></html>"
            ].join("");
            const oWindow = window.open("", "", "width=1200,height=800");

            if (!oWindow) {
                MessageBox.warning("팝업 차단을 해제한 뒤 다시 시도해주세요.");
                return;
            }

            oWindow.document.write(sHtml);
            oWindow.document.close();
            oWindow.focus();
            setTimeout(() => {
                oWindow.print();
            }, 500);
        },

        _getVizSvgMarkup(sChartId) {
            const oChart = this.byId(sChartId);
            const oDom = oChart && oChart.getDomRef();
            const oSvg = oDom && oDom.querySelector("svg");

            if (!oSvg) {
                return "";
            }

            const oClone = oSvg.cloneNode(true);
            const oRect = oSvg.getBoundingClientRect();
            const fWidth = parseFloat(oSvg.getAttribute("width")) || oRect.width;
            const fHeight = parseFloat(oSvg.getAttribute("height")) || oRect.height;

            if (!oClone.getAttribute("viewBox") && fWidth && fHeight) {
                oClone.setAttribute("viewBox", "0 0 " + fWidth + " " + fHeight);
            }

            oClone.removeAttribute("width");
            oClone.removeAttribute("height");
            oClone.setAttribute("preserveAspectRatio", "xMidYMid meet");

            return oClone.outerHTML;
        },

        _buildDetailPdfSummary(oDetail) {
            return [
                "<section class='section summary'>",
                this._buildPdfSummaryItem("자재번호", oDetail.matnr),
                this._buildPdfSummaryItem("자재명", oDetail.maktx),
                this._buildPdfSummaryItem("제품 옵션", oDetail.mtopt_t, oDetail.mtopt),
                this._buildPdfSummaryItem("자재유형", oDetail.mtbez, oDetail.mtart),
                this._buildPdfSummaryItem("자재그룹", oDetail.wgbez, oDetail.matkl),
                "<div class='item total'><div class='label'>총 표준원가</div><div class='value'>" + this._escapeHtml(this.formatAmount(oDetail.total_cost)) + " " + this._escapeHtml(oDetail.waers) + "</div><div class='sub'>" + this._escapeHtml(oDetail.gjahr + " / " + oDetail.monat) + "</div></div>",
                "</section>"
            ].join("");
        },

        _buildPdfSummaryItem(sLabel, sValue, sSubValue) {
            return [
                "<div class='item'>",
                "<div class='label'>" + this._escapeHtml(sLabel) + "</div>",
                "<div class='value'>" + this._escapeHtml(sValue || "-") + "</div>",
                sSubValue ? "<div class='sub'>" + this._escapeHtml(sSubValue) + "</div>" : "",
                "</div>"
            ].join("");
        },

        _buildDetailPdfCostTable(aRows) {
            const aMarkup = ["<section class='section'><h2>원가 구성요소 상세</h2><table><thead><tr><th>원가구성요소</th><th class='num'>금액</th><th class='num'>비율(%)</th><th class='center'>통화</th></tr></thead><tbody>"];
            aRows.forEach((oItem) => {
                aMarkup.push("<tr><td>" + this._escapeHtml(oItem.cost_comp_text) + "</td><td class='num'>" + this._escapeHtml(this.formatAmount(oItem.amount)) + "</td><td class='num'>" + this._escapeHtml(this.formatPercent(oItem.percent)) + "</td><td class='center'>" + this._escapeHtml(oItem.waers) + "</td></tr>");
            });
            aMarkup.push("</tbody></table></section>");
            return aMarkup.join("");
        },

        _buildDetailPdfBOMTable(aRows) {
            const aMarkup = ["<section class='section'><h2>BOM 재료비 구성</h2><table><thead><tr><th>구성자재</th><th class='num'>투입량</th><th class='num'>단가</th><th class='num'>금액</th><th class='center'>통화</th></tr></thead><tbody>"];
            aRows.forEach((oItem) => {
                aMarkup.push("<tr><td>" + this._escapeHtml(this.formatBomComponentName(oItem.maktx, oItem.idnrk)) + "</td><td class='num'>" + this._escapeHtml(this.formatBomComponentQuantity(oItem.menge, oItem.bmeng)) + " " + this._escapeHtml(oItem.meins) + "</td><td class='num'>" + this._escapeHtml(this.formatAmount(oItem.comp_unit_cost)) + "</td><td class='num'>" + this._escapeHtml(this.formatAmount(oItem.comp_total_cost)) + "</td><td class='center'>" + this._escapeHtml(oItem.waers) + "</td></tr>");
            });
            aMarkup.push("</tbody></table></section>");
            return aMarkup.join("");
        },

        _buildDetailPdfHistoryTable(aRows) {
            const aMarkup = ["<table><thead><tr><th>기간</th><th class='num'>표준단가</th></tr></thead><tbody>"];
            aRows.forEach((oItem) => {
                aMarkup.push("<tr><td>" + this._escapeHtml(oItem.period) + "</td><td class='num'>" + this._escapeHtml(this.formatAmount(oItem.cost)) + "</td></tr>");
            });
            aMarkup.push("</tbody></table>");
            return aMarkup.join("");
        },

        _buildDetailPdfReservationSummary(oSummary, aRows) {
            return [
                "<section class='section'><h2>예약 데이터 요약</h2>",
                "<p>예약 건수: " + this._escapeHtml(this.formatQuantity(oSummary && oSummary.count)) + " / 예약수량 합계: " + this._escapeHtml(this.formatQuantity(oSummary && oSummary.openQuantity)) + "</p>",
                "<table><thead><tr><th>구분</th><th>문서</th><th>항목</th><th class='num'>예약수량</th><th class='center'>단위</th><th class='center'>상태</th></tr></thead><tbody>",
                (aRows || []).map((oItem) => "<tr><td>" + this._escapeHtml(oItem.source) + "</td><td>" + this._escapeHtml(oItem.document) + "</td><td>" + this._escapeHtml(oItem.item) + "</td><td class='num'>" + this._escapeHtml(this.formatQuantity(oItem.reservationQuantity)) + "</td><td class='center'>" + this._escapeHtml(oItem.meins) + "</td><td class='center'>" + this._escapeHtml(oItem.statusText) + "</td></tr>").join(""),
                "</tbody></table></section>"
            ].join("");
        },

        _escapeHtml(sValue) {
            return String(sValue || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
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
