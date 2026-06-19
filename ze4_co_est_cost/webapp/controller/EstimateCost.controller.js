sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "ze4/co/est/cost/ze4coestcost/model/formatter"
], (Controller, JSONModel, ODataModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, formatter) => {
    "use strict";

    return Controller.extend("ze4.co.est.cost.ze4coestcost.controller.EstimateCost", {
        formatter: formatter,

        onInit() {
            this._mLazyModels = {};
            formatter.setResourceBundle(this._getResourceBundle());
            this.getView().setModel(new JSONModel(this._getInitialFilters()), "filters");
            this.getView().setModel(new JSONModel({
                busy: false,
                message: "",
                messageType: "Information",
                messageVisible: false,
                mainTableVisibleRowCount: 5
            }), "ui");
            this.getView().setModel(new JSONModel({ items: [] }), "main");
            this.getView().setModel(new JSONModel({ data: {} }), "kpi");
            this.getView().setModel(new JSONModel({
                varianceParts: [],
                hasVarianceParts: false
            }), "chart");
            this.getView().setModel(new JSONModel({
                items: [],
                hasItems: false
            }), "topVariance");
            this.getView().setModel(new JSONModel({
                items: [],
                hasItems: false
            }), "processingBreakdown");
            this.getView().setModel(new JSONModel(this._getEmptyAnalysis()), "analysis");
            this.getView().setModel(new JSONModel({ items: [] }), "history");
            this.getView().setModel(new JSONModel({ items: [], entitySet: "" }), "materialTypes");

            this.byId("varianceChart").setVizProperties({
                legend: {
                    visible: true
                },
                plotArea: {
                    drawingEffect: "glossy",
                    dataLabel: {
                        visible: true,
                        type: "percentage"
                    }
                },
                title: {
                    visible: false
                }
            });

            this._loadMaterialTypes();
        },

        onCloseMessage() {
            this._setMessage("", "Information");
        },

        onReset() {
            this.getView().getModel("filters").setData(this._getInitialFilters());
            this.getView().getModel("main").setData({ items: [] });
            this._updateMainTableRowCount(0);
            this.getView().getModel("kpi").setData({ data: {} });
            this.getView().getModel("chart").setData({
                varianceParts: [],
                hasVarianceParts: false
            });
            this.getView().getModel("topVariance").setData({
                items: [],
                hasItems: false
            });
            this.getView().getModel("processingBreakdown").setData({
                items: [],
                hasItems: false
            });
            this.getView().getModel("analysis").setData(this._getEmptyAnalysis());
            this.getView().getModel("history").setData({ items: [] });
            this._clearInputStates();
            this._setMessage("", "Information");
            this._clearMainSelection();
        },

        async onSearch() {
            var mFilters = this._collectFilters();
            if (!this._validateRequiredFilters(mFilters)) {
                this._setMessage(this._text("requiredFilterMessage"), "Error");
                return;
            }

            this._setBusy(true);
            this._setMessage("", "Information");
            this._clearMainSelection();
            this._clearResultModels();

            var aResults = await Promise.all([
                this._readMainData(mFilters).then(function () {
                    return null;
                }).catch(function (oError) {
                    return oError;
                }),
                this._readKpiData(mFilters).then(function () {
                    return null;
                }).catch(function (oError) {
                    return oError;
                }),
                this._readHistoryData(mFilters).then(function () {
                    return null;
                }).catch(function (oError) {
                    return oError;
                })
            ]);

            this._setBusy(false);

            var aErrors = aResults.filter(Boolean).map(this._getErrorMessage.bind(this));
            if (aErrors.length) {
                var sMessage = aErrors.join("\n");
                this._setMessage(sMessage, "Error");
                MessageBox.error(sMessage);
                return;
            }

            if (!this.getView().getModel("main").getProperty("/items").length) {
                this._setMessage(this._text("noDataAfterSearch"), "Information");
            }
        },

        onMainSelectionChange() {
            var oTable = this.byId("mainTable");
            var aSelectedItems = this._getSelectedMainItems(oTable);

            this._updateAnalysis(aSelectedItems);
        },

        _clearResultModels() {
            this.getView().getModel("main").setData({ items: [] });
            this._updateMainTableRowCount(0);
            this.getView().getModel("kpi").setData({ data: {} });
            this.getView().getModel("chart").setData({
                varianceParts: [],
                hasVarianceParts: false
            });
            this.getView().getModel("topVariance").setData({
                items: [],
                hasItems: false
            });
            this.getView().getModel("processingBreakdown").setData({
                items: [],
                hasItems: false
            });
            this.getView().getModel("analysis").setData(this._getEmptyAnalysis());
            this.getView().getModel("history").setData({ items: [] });
        },

        async onExecuteSettlement() {
            var mFilters = this._collectFilters();
            if (!this._validateRequiredFilters(mFilters)) {
                this._setMessage(this._text("requiredFilterMessage"), "Error");
                return;
            }

            var oModel = this.getView().getModel();
            var oFunctionImport;

            try {
                await oModel.metadataLoaded();
                oFunctionImport = this._findFunctionImport(oModel.getServiceMetadata(), "ExecutePriceSettlement");
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
                return;
            }

            if (!oFunctionImport) {
                MessageBox.information(this._text("executeActionNeedsConfirmation"));
                return;
            }

            if (this._functionImportRequiresParameter(oFunctionImport, "IvWerks")) {
                MessageBox.error(this._text("executeActionPlantParameterRequired"));
                return;
            }

            this._setBusy(true);
            this._callFunction(oModel, "ExecutePriceSettlement", {
                IvBukrs: mFilters.bukrs,
                IvGjahr: mFilters.gjahr,
                IvPoper: mFilters.monat
            }).then(function () {
                MessageToast.show(this._text("executeActionSuccess"));
                return this.onSearch();
            }.bind(this)).catch(function (oError) {
                var sMessage = this._getErrorMessage(oError);
                this._setMessage(sMessage, "Error");
                MessageBox.error(sMessage);
            }.bind(this)).finally(function () {
                this._setBusy(false);
            }.bind(this));
        },

        _readMainData(mFilters) {
            var oModel = this.getView().getModel();
            return this._getParameterizedSetPath(oModel, {
                p_bukrs: mFilters.bukrs,
                p_gjahr: mFilters.gjahr,
                p_monat: mFilters.monat,
                p_werks: ""
            }).then(function (sPath) {
                return this._readOData(oModel, sPath, this._buildMainFilters(mFilters), this._buildMainSorters());
            }.bind(this)).then(function (aItems) {
                var aPreparedItems = this._prepareMainItems(this._aggregateMainItems(aItems));
                this.getView().getModel("main").setData({ items: aPreparedItems });
                this._updateMainTableRowCount(aPreparedItems.length);
                this._applyMainVarianceTotalToKpi(aPreparedItems);
                this._updateChartFromMain(aPreparedItems);
                this._updateTopVariance(aPreparedItems);
                this._updateProcessingBreakdown(aPreparedItems);
                this._updateAnalysis([]);
            }.bind(this));
        },

        _readKpiData(mFilters) {
            var oModel;
            try {
                oModel = this._getLazyODataModel("summaryService");
            } catch (oError) {
                return Promise.reject(oError);
            }

            return this._getParameterizedSetPath(oModel, {
                p_bukrs: mFilters.bukrs,
                p_gjahr: mFilters.gjahr,
                p_monat: mFilters.monat,
                p_werks: ""
            }).then(function (sPath) {
                return this._readOData(oModel, sPath, []);
            }.bind(this)).then(function (aItems) {
                var oKpi = this._prepareKpiData(aItems[0] || {});
                this.getView().getModel("kpi").setData({ data: oKpi });
                this._applyMainVarianceTotalToKpi(this.getView().getModel("main").getProperty("/items") || []);
            }.bind(this));
        },

        _readHistoryData(mFilters) {
            var oModel;
            try {
                oModel = this._getLazyODataModel("historyService");
            } catch (oError) {
                return Promise.reject(oError);
            }

            return this._getEntitySetPathByProperties(oModel, [
                "matnr",
                "gjahr",
                "monat",
                "actual_total_cost",
                "status"
            ]).then(function (sPath) {
                return this._readOData(oModel, sPath, this._buildHistoryFilters(mFilters));
            }.bind(this)).then(function (aItems) {
                this.getView().getModel("history").setData({ items: aItems });
            }.bind(this));
        },

        _readOData(oModel, sPath, aFilters, aSorters) {
            return new Promise(function (resolve, reject) {
                oModel.read(sPath, {
                    filters: aFilters || [],
                    sorters: aSorters || [],
                    success: function (oData) {
                        resolve(oData && Array.isArray(oData.results) ? oData.results : (oData ? [oData] : []));
                    },
                    error: reject
                });
            });
        },

        _getSelectedMainItems(oTable) {
            if (!oTable) {
                return [];
            }

            if (typeof oTable.getSelectedContexts === "function") {
                return oTable.getSelectedContexts("main").map(function (oContext) {
                    return oContext.getObject();
                });
            }

            if (typeof oTable.getSelectedIndices === "function") {
                return oTable.getSelectedIndices().map(function (iIndex) {
                    var oContext = oTable.getContextByIndex(iIndex);
                    return oContext && oContext.getObject();
                }).filter(Boolean);
            }

            return [];
        },

        _aggregateMainItems(aItems) {
            var aAmountFields = [
                "std_item_total_cost",
                "std_material_cost",
                "std_labor_cost",
                "std_overhead_cost",
                "std_processing_cost",
                "raw_price_diff_amt",
                "raw_processing_diff_amt",
                "labor_clear_amt",
                "mach_clear_amt",
                "overhead_clear_amt",
                "alloc_diff_amt",
                "price_diff_amt",
                "processing_diff_amt",
                "settlement_variance_amt",
                "target_variance_amt",
                "clear_line_count"
            ];
            var aFlagFields = [
                "std_component_exists",
                "actual_exists",
                "actual_calc_target"
            ];
            var mGroups = {};
            var aGroups = [];

            (aItems || []).forEach(function (oItem) {
                var sKey = [
                    oItem.matnr,
                    oItem.mtopt,
                    oItem.gjahr,
                    oItem.monat,
                    oItem.werks,
                    oItem.waers
                ].join("\u001f");
                var oGroup = mGroups[sKey];

                if (!oGroup) {
                    oGroup = Object.assign({}, oItem, {
                        _amountTotals: {}
                    });
                    aAmountFields.forEach(function (sFieldName) {
                        oGroup._amountTotals[sFieldName] = {
                            value: 0,
                            hasValue: false
                        };
                        oGroup[sFieldName] = null;
                    });
                    mGroups[sKey] = oGroup;
                    aGroups.push(oGroup);
                }

                aAmountFields.forEach(function (sFieldName) {
                    this._accumulateAmount(oGroup._amountTotals[sFieldName], oItem[sFieldName]);
                }.bind(this));

                aFlagFields.forEach(function (sFieldName) {
                    if (oItem[sFieldName] === "X") {
                        oGroup[sFieldName] = "X";
                    }
                });
            }.bind(this));

            aGroups.forEach(function (oGroup) {
                aAmountFields.forEach(function (sFieldName) {
                    var oTotal = oGroup._amountTotals[sFieldName];
                    oGroup[sFieldName] = oTotal.hasValue ? oTotal.value : null;
                });
                delete oGroup._amountTotals;
            });

            return aGroups;
        },

        _prepareMainItems(aItems) {
            return (aItems || []).map(function (oItem) {
                var oPrepared = Object.assign({}, oItem);
                var fPriceDiff = this._toAmount(oPrepared.price_diff_amt);
                var fProcessingDiff = this._toAmount(oPrepared.processing_diff_amt);
                var fSettlementVariance = this._getBPlanVarianceAmount(oPrepared, fPriceDiff, fProcessingDiff);
                var fStandardTotal = this._toAmount(oPrepared.std_total_cost);
                var fStandardProcessing = this._toAmount(oPrepared.std_processing_cost);

                oPrepared.display_variance_amt = fSettlementVariance;
                oPrepared.display_expected_actual_cost =
                    fStandardTotal !== null && fSettlementVariance !== null ? fStandardTotal + fSettlementVariance : null;
                oPrepared.display_diff_rate_pct =
                    fStandardTotal !== null && fStandardTotal !== 0 && fSettlementVariance !== null ?
                        (fSettlementVariance / fStandardTotal) * 100 :
                        null;
                oPrepared.actual_price_cost =
                    fStandardTotal !== null && fPriceDiff !== null ? fStandardTotal + fPriceDiff : null;
                oPrepared.actual_processing_cost =
                    fStandardProcessing !== null && fProcessingDiff !== null ? fStandardProcessing + fProcessingDiff : null;

                return oPrepared;
            }.bind(this));
        },

        _prepareKpiData(oKpi) {
            var oPrepared = Object.assign({}, oKpi);
            oPrepared.display_total_variance_amt = this._toAmount(oPrepared.settlement_variance_amt);
            return oPrepared;
        },

        _getBPlanVarianceAmount(oItem, fPriceDiff, fProcessingDiff) {
            var sMaterialType = this._trimUpper(oItem && oItem.mtart);

            if (sMaterialType === "ROH" || sMaterialType === "HALB") {
                return fPriceDiff;
            }

            if (sMaterialType === "FERT") {
                return fProcessingDiff;
            }

            return null;
        },

        _applyMainVarianceTotalToKpi(aItems) {
            var oTotal = {
                value: 0,
                hasValue: false
            };
            var sCurrency = "";

            (aItems || []).forEach(function (oItem) {
                this._accumulateAmount(oTotal, oItem.display_variance_amt);
                if (!sCurrency && oItem.waers) {
                    sCurrency = oItem.waers;
                }
            }.bind(this));

            var oKpiModel = this.getView().getModel("kpi");
            oKpiModel.setProperty("/data/display_total_variance_amt", oTotal.hasValue ? oTotal.value : null);
            if (!oKpiModel.getProperty("/data/waers") && sCurrency) {
                oKpiModel.setProperty("/data/waers", sCurrency);
            }
        },

        _loadMaterialTypes() {
            var oModel;
            try {
                oModel = this._getLazyODataModel("materialTypeService");
            } catch (oError) {
                this._setMessage(this._getErrorMessage(oError), "Warning");
                return;
            }

            this._getEntitySetPathByProperties(oModel, ["mtart", "mtbez"]).then(function (sPath) {
                this.getView().getModel("materialTypes").setProperty("/entitySet", sPath.replace(/^\//, ""));
                return this._readOData(oModel, sPath, []);
            }.bind(this)).then(function (aItems) {
                this.getView().getModel("materialTypes").setProperty("/items", aItems);
            }.bind(this)).catch(function (oError) {
                this._setMessage(this._text("materialTypeLoadFailed", [this._getErrorMessage(oError)]), "Warning");
            }.bind(this));
        },

        _callFunction(oModel, sFunctionName, mParameters) {
            return new Promise(function (resolve, reject) {
                oModel.callFunction("/" + sFunctionName, {
                    method: "POST",
                    urlParameters: mParameters,
                    success: resolve,
                    error: reject
                });
            });
        },

        _getLazyODataModel(sDataSourceName) {
            if (this._mLazyModels[sDataSourceName]) {
                return this._mLazyModels[sDataSourceName];
            }

            var oDataSources = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources") || {};
            var sUri = oDataSources[sDataSourceName] && oDataSources[sDataSourceName].uri;
            if (!sUri) {
                var mMissingTextKeys = {
                    summaryService: "summaryServiceMissing",
                    historyService: "historyServiceMissing",
                    materialTypeService: "materialTypeServiceMissing"
                };
                throw new Error(this._text(mMissingTextKeys[sDataSourceName] || "unknownError"));
            }

            this._mLazyModels[sDataSourceName] = new ODataModel(sUri, {
                defaultCountMode: "Inline"
            });
            return this._mLazyModels[sDataSourceName];
        },

        _getParameterizedSetPath(oModel, mParameters) {
            return oModel.metadataLoaded().then(function () {
                var oResolved = this._resolveParameterizedEntity(oModel.getServiceMetadata(), Object.keys(mParameters));
                if (!oResolved) {
                    throw new Error(this._text("parameterizedMetadataMissing"));
                }

                var mKeyParameters = {};
                oResolved.parameterNames.forEach(function (sParameterName) {
                    var bEmptyValue = mParameters[sParameterName] === undefined ||
                        mParameters[sParameterName] === null ||
                        (mParameters[sParameterName] === "" && sParameterName !== "p_werks");
                    if (bEmptyValue) {
                        throw new Error(this._text("parameterizedMetadataMissing"));
                    }
                    mKeyParameters[sParameterName] = mParameters[sParameterName];
                }.bind(this));

                var sKeyPath = oModel.createKey(oResolved.entitySetName, mKeyParameters);
                return "/" + sKeyPath + "/" + oResolved.navigationName;
            }.bind(this));
        },

        _getEntitySetPathByProperties(oModel, aProperties) {
            return oModel.metadataLoaded().then(function () {
                var sEntitySet = this._resolveEntitySetByProperties(oModel.getServiceMetadata(), aProperties);
                if (!sEntitySet) {
                    throw new Error(this._text("entitySetMetadataMissing"));
                }

                return "/" + sEntitySet;
            }.bind(this));
        },

        _resolveParameterizedEntity(oMetadata, aParameterNames) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            for (var i = 0; i < aSchemas.length; i += 1) {
                var oSchema = aSchemas[i];
                var aEntityTypes = this._array(oSchema.entityType);
                var oParameterType = aEntityTypes.find(function (oEntityType) {
                    var aEntityParameterNames = this._array(oEntityType.property).map(function (oProperty) {
                        return oProperty.name;
                    });

                    return this._isParameterEntityType(oEntityType) &&
                        aEntityParameterNames.every(function (sParameterName) {
                            return aParameterNames.indexOf(sParameterName) !== -1;
                        });
                }.bind(this));

                if (!oParameterType) {
                    continue;
                }

                var oEntitySet = this._findEntitySetForType(oSchema, oParameterType.name);
                var aNavigation = this._array(oParameterType.navigationProperty);
                var oNavigation = aNavigation.find(function (oNav) {
                    return oNav.name === "Set";
                }) || aNavigation[0];

                if (oEntitySet && oNavigation) {
                    return {
                        entitySetName: oEntitySet.name,
                        navigationName: oNavigation.name,
                        parameterNames: this._array(oParameterType.property).map(function (oProperty) {
                            return oProperty.name;
                        })
                    };
                }
            }

            return null;
        },

        _resolveEntitySetByProperties(oMetadata, aProperties) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            for (var i = 0; i < aSchemas.length; i += 1) {
                var oSchema = aSchemas[i];
                var aEntityTypes = this._array(oSchema.entityType);
                var oEntityType = aEntityTypes.find(function (oCandidate) {
                    return !this._isParameterEntityType(oCandidate) &&
                        this._hasProperties(oCandidate, aProperties);
                }.bind(this));

                if (!oEntityType) {
                    continue;
                }

                var oEntitySet = this._findEntitySetForType(oSchema, oEntityType.name);
                if (oEntitySet) {
                    return oEntitySet.name;
                }
            }

            return "";
        },

        _findEntitySetForType(oSchema, sTypeName) {
            var sFullName = oSchema.namespace + "." + sTypeName;
            var aContainers = this._array(oSchema.entityContainer);

            for (var i = 0; i < aContainers.length; i += 1) {
                var aEntitySets = this._array(aContainers[i].entitySet);
                var oEntitySet = aEntitySets.find(function (oSet) {
                    return oSet.entityType === sFullName || oSet.entityType === sTypeName;
                });

                if (oEntitySet) {
                    return oEntitySet;
                }
            }

            return null;
        },

        _findFunctionImport(oMetadata, sFunctionName) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            for (var i = 0; i < aSchemas.length; i += 1) {
                var aContainers = this._array(aSchemas[i].entityContainer);
                for (var j = 0; j < aContainers.length; j += 1) {
                    var aFunctions = this._array(aContainers[j].functionImport);
                    var oFunction = aFunctions.find(function (oCandidate) {
                        return oCandidate.name === sFunctionName;
                    });
                    if (oFunction) {
                        return oFunction;
                    }
                }
            }

            return null;
        },

        _functionImportRequiresParameter(oFunctionImport, sParameterName) {
            return this._array(oFunctionImport && oFunctionImport.parameter).some(function (oParameter) {
                return oParameter.name === sParameterName;
            });
        },

        _buildMainFilters(mFilters) {
            var aFilters = [];

            if (mFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.Contains, mFilters.matnr));
            }

            if (mFilters.mtart) {
                aFilters.push(new Filter("mtart", FilterOperator.EQ, mFilters.mtart));
            }

            return aFilters;
        },

        _buildMainSorters() {
            return [
                new Sorter("matnr", false),
                new Sorter("mtopt", false)
            ];
        },

        _buildHistoryFilters(mFilters) {
            var aFilters = [
                new Filter("gjahr", FilterOperator.EQ, mFilters.gjahr),
                new Filter("monat", FilterOperator.EQ, this._toCalendarMonth(mFilters.monat))
            ];

            if (mFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.Contains, mFilters.matnr));
            }

            if (mFilters.mtart) {
                aFilters.push(new Filter("mtart", FilterOperator.EQ, mFilters.mtart));
            }

            return aFilters;
        },

        _updateChartFromMain(aItems) {
            var oBundle = this._getResourceBundle();
            var mTotals = {
                priceUp: {
                    value: 0,
                    hasValue: false
                },
                priceDown: {
                    value: 0,
                    hasValue: false
                },
                processingUp: {
                    value: 0,
                    hasValue: false
                },
                processingDown: {
                    value: 0,
                    hasValue: false
                }
            };

            (aItems || []).forEach(function (oItem) {
                var sMaterialType = this._trimUpper(oItem.mtart);
                var fVariance = this._toAmount(oItem.display_variance_amt);
                var oTargetTotal;

                if (fVariance === null || fVariance === 0) {
                    return;
                }

                if (sMaterialType === "ROH" || sMaterialType === "HALB") {
                    oTargetTotal = fVariance > 0 ? mTotals.priceUp : mTotals.priceDown;
                } else if (sMaterialType === "FERT") {
                    oTargetTotal = fVariance > 0 ? mTotals.processingUp : mTotals.processingDown;
                } else {
                    return;
                }

                oTargetTotal.value += Math.abs(fVariance);
                oTargetTotal.hasValue = true;
            }.bind(this));

            var aParts = [
                {
                    category: oBundle.getText("chartPriceUp"),
                    amount: mTotals.priceUp.hasValue ? mTotals.priceUp.value : null
                },
                {
                    category: oBundle.getText("chartPriceDown"),
                    amount: mTotals.priceDown.hasValue ? mTotals.priceDown.value : null
                },
                {
                    category: oBundle.getText("chartProcessingUp"),
                    amount: mTotals.processingUp.hasValue ? mTotals.processingUp.value : null
                },
                {
                    category: oBundle.getText("chartProcessingDown"),
                    amount: mTotals.processingDown.hasValue ? mTotals.processingDown.value : null
                }
            ].filter(function (oPart) {
                return oPart.amount !== null && oPart.amount !== 0;
            });

            this.getView().getModel("chart").setData({
                varianceParts: aParts,
                hasVarianceParts: aParts.length > 0
            });
        },

        _updateTopVariance(aItems) {
            var aTopItems = (aItems || []).filter(function (oItem) {
                return this._toAmount(oItem.display_variance_amt) !== null;
            }.bind(this)).slice().sort(function (oLeft, oRight) {
                return Math.abs(this._toAmount(oRight.display_variance_amt)) -
                    Math.abs(this._toAmount(oLeft.display_variance_amt));
            }.bind(this)).slice(0, 3);

            this.getView().getModel("topVariance").setData({
                items: aTopItems,
                hasItems: aTopItems.length > 0
            });
        },

        _updateProcessingBreakdown(aItems) {
            var oBundle = this._getResourceBundle();
            var aDefinitions = [
                {
                    key: "labor_clear_amt",
                    label: oBundle.getText("processingLabor")
                },
                {
                    key: "mach_clear_amt",
                    label: oBundle.getText("processingMachine")
                },
                {
                    key: "overhead_clear_amt",
                    label: oBundle.getText("processingOverhead")
                },
                {
                    key: "processing_clear_amt",
                    label: oBundle.getText("processingClearing")
                }
            ];
            var sCurrency = "";
            var aBreakdown = aDefinitions.map(function (oDefinition) {
                var oTotal = {
                    value: 0,
                    hasValue: false
                };

                (aItems || []).forEach(function (oItem) {
                    this._accumulateAmount(oTotal, oItem[oDefinition.key]);
                    if (!sCurrency && oItem.waers) {
                        sCurrency = oItem.waers;
                    }
                }.bind(this));

                return {
                    category: oDefinition.label,
                    amount: oTotal.hasValue ? oTotal.value : null,
                    waers: sCurrency
                };
            }.bind(this)).filter(function (oItem) {
                return oItem.amount !== null;
            });

            this.getView().getModel("processingBreakdown").setData({
                items: aBreakdown,
                hasItems: aBreakdown.length > 0
            });
        },

        _updateMainTableRowCount(iItemCount) {
            var oUiModel = this.getView().getModel("ui");
            var aItems = this.getView().getModel("main").getProperty("/items") || [];
            var iCount = typeof iItemCount === "number" ? iItemCount : aItems.length;
            var iTargetRows = this._getMainTableTargetRows();
            var iVisibleRows = iCount > 0 ? Math.min(iCount, iTargetRows) : 5;

            oUiModel.setProperty("/mainTableVisibleRowCount", Math.max(1, iVisibleRows));
        },

        _getMainTableTargetRows() {
            var iViewportHeight = 900;

            if (typeof window !== "undefined" && window.innerHeight) {
                iViewportHeight = window.innerHeight;
            } else if (typeof document !== "undefined" &&
                document.documentElement &&
                document.documentElement.clientHeight) {
                iViewportHeight = document.documentElement.clientHeight;
            }

            if (iViewportHeight >= 1200) {
                return 16;
            }

            if (iViewportHeight >= 1000) {
                return 12;
            }

            if (iViewportHeight >= 850) {
                return 10;
            }

            return 8;
        },

        _updateAnalysis(aSelectedItems) {
            var mAnalysis = this._getEmptyAnalysis();
            var mTotals = {
                priceDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                processingDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                settlementVarianceTotal: {
                    value: 0,
                    hasValue: false
                }
            };

            mAnalysis.items = aSelectedItems;
            mAnalysis.selectedCount = aSelectedItems.length;

            aSelectedItems.forEach(function (oItem) {
                this._accumulateAmount(mTotals.priceDiffTotal, oItem.price_diff_amt);
                this._accumulateAmount(mTotals.processingDiffTotal, oItem.processing_diff_amt);
                this._accumulateAmount(mTotals.settlementVarianceTotal, oItem.display_variance_amt);
                if (!mAnalysis.currency && oItem.waers) {
                    mAnalysis.currency = oItem.waers;
                }
            }.bind(this));

            mAnalysis.priceDiffTotal = mTotals.priceDiffTotal.hasValue ? mTotals.priceDiffTotal.value : null;
            mAnalysis.processingDiffTotal = mTotals.processingDiffTotal.hasValue ? mTotals.processingDiffTotal.value : null;
            mAnalysis.settlementVarianceTotal = mTotals.settlementVarianceTotal.hasValue ? mTotals.settlementVarianceTotal.value : null;

            this.getView().getModel("analysis").setData(mAnalysis);
        },

        _collectFilters() {
            var oData = Object.assign({}, this.getView().getModel("filters").getData());
            oData.bukrs = this._trimUpper(oData.bukrs);
            oData.gjahr = String(oData.gjahr || "").trim();
            oData.monat = this._normalizePoper(oData.monat);
            oData.matnr = this._trimUpper(oData.matnr);
            oData.mtart = this._trimUpper(oData.mtart);
            this.getView().getModel("filters").setData(oData);
            return oData;
        },

        _validateRequiredFilters(mFilters) {
            this._clearInputStates();

            var bValid = true;
            bValid = this._validateInput("companyCodeInput", !!mFilters.bukrs) && bValid;
            bValid = this._validateInput("fiscalYearInput", /^\d{4}$/.test(mFilters.gjahr)) && bValid;
            bValid = this._validateInput("periodInput", /^(00[1-9]|01[0-2])$/.test(mFilters.monat)) && bValid;
            return bValid;
        },

        _validateInput(sId, bValid) {
            var oControl = this.byId(sId);
            oControl.setValueState(bValid ? "None" : "Error");
            oControl.setValueStateText(this._text("requiredField"));
            return bValid;
        },

        _clearInputStates() {
            ["companyCodeInput", "fiscalYearInput", "periodInput"].forEach(function (sId) {
                var oControl = this.byId(sId);
                if (oControl) {
                    oControl.setValueState("None");
                }
            }.bind(this));
        },

        _clearMainSelection() {
            var oTable = this.byId("mainTable");
            if (oTable) {
                if (typeof oTable.removeSelections === "function") {
                    oTable.removeSelections(true);
                } else if (typeof oTable.clearSelection === "function") {
                    oTable.clearSelection();
                }
            }
            this._updateAnalysis([]);
        },

        _setBusy(bBusy) {
            this.getView().getModel("ui").setProperty("/busy", bBusy);
        },

        _setMessage(sMessage, sType) {
            var oModel = this.getView().getModel("ui");
            oModel.setProperty("/message", sMessage);
            oModel.setProperty("/messageType", sType || "Information");
            oModel.setProperty("/messageVisible", !!sMessage);
        },

        _getInitialFilters() {
            var oToday = new Date();
            var sMonth = String(oToday.getMonth() + 1).padStart(3, "0");

            return {
                bukrs: "0001",
                gjahr: String(oToday.getFullYear()),
                monat: sMonth,
                matnr: "",
                mtart: ""
            };
        },

        _getEmptyAnalysis() {
            return {
                items: [],
                selectedCount: 0,
                priceDiffTotal: null,
                processingDiffTotal: null,
                settlementVarianceTotal: null,
                currency: ""
            };
        },

        _trimUpper(sValue) {
            return String(sValue || "").trim().toUpperCase();
        },

        _normalizePoper(sValue) {
            var sDigits = String(sValue || "").replace(/\D/g, "");
            if (!sDigits) {
                return "";
            }

            return sDigits.padStart(3, "0");
        },

        _toCalendarMonth(sPoper) {
            return String(sPoper || "").slice(-2);
        },

        _toAmount(vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return null;
            }

            var fValue = Number(vValue);
            return Number.isFinite(fValue) ? fValue : null;
        },

        _accumulateAmount(oTotal, vValue) {
            var fAmount = this._toAmount(vValue);
            if (fAmount === null) {
                return;
            }

            oTotal.value += fAmount;
            oTotal.hasValue = true;
        },

        _hasProperties(oEntityType, aProperties) {
            var aNames = this._array(oEntityType.property).map(function (oProperty) {
                return oProperty.name;
            });

            return aProperties.every(function (sProperty) {
                return aNames.indexOf(sProperty) !== -1;
            });
        },

        _isParameterEntityType(oEntityType) {
            return oEntityType &&
                (
                    oEntityType["sap:semantics"] === "parameters" ||
                    oEntityType.semantics === "parameters" ||
                    this._getSapExtensionValue(oEntityType, "semantics") === "parameters" ||
                    /Parameters$/.test(oEntityType.name || "")
                );
        },

        _getSapExtensionValue(oObject, sName) {
            var oExtension = this._array(oObject && oObject.extensions).find(function (oCandidate) {
                return oCandidate.name === sName;
            });

            return oExtension && oExtension.value;
        },

        _array(vValue) {
            if (!vValue) {
                return [];
            }

            return Array.isArray(vValue) ? vValue : [vValue];
        },

        _path(oObject, sPath) {
            return sPath.split(".").reduce(function (oCurrent, sPart) {
                return oCurrent && oCurrent[sPart];
            }, oObject);
        },

        _getErrorMessage(oError) {
            if (!oError) {
                return this._text("unknownError");
            }

            if (oError instanceof Error && oError.message) {
                return oError.message;
            }

            if (oError.responseText) {
                try {
                    var oResponse = JSON.parse(oError.responseText);
                    var sMessage = this._path(oResponse, "error.message.value") ||
                        this._path(oResponse, "error.message");
                    if (sMessage) {
                        return sMessage;
                    }
                } catch (oParseError) {
                    return oError.responseText;
                }
            }

            return oError.message || oError.statusText || this._text("unknownError");
        },

        _getResourceBundle() {
            var oI18nModel = this.getOwnerComponent().getModel("i18n") || this.getView().getModel("i18n");
            return oI18nModel.getResourceBundle();
        },

        _text(sKey, aArgs) {
            return this._getResourceBundle().getText(sKey, aArgs);
        }
    });
});
