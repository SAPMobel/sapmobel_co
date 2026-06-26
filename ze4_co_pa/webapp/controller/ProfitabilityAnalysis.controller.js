sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/viz/ui5/controls/Popover",
    "ze4/co/pa/ze4copa/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, VizPopover, formatter) {
    "use strict";

    return Controller.extend("ze4.co.pa.ze4copa.controller.ProfitabilityAnalysis", {
        formatter: formatter,

        onInit: function () {
            this._mEndpointCache = {};
            this._oViewModel = new JSONModel(this._createInitialState());
            this._oViewModel.setSizeLimit(10000);

            var oView = this.getView && this.getView();
            if (!oView) {
                return;
            }

            this._sViewName = oView.getViewName();
            oView.setModel(this._oViewModel, "app");
            this.onSearch();
        },

        onAfterRendering: function () {
            this._applyChartProperties();
            this._connectChartPopovers();
        },

        _createInitialState: function () {
            return {
                busy: false,
                productBusy: false,
                actualPlanBusy: false,
                drilldownBusy: false,
                filters: this._getDefaultFilterValues(),
                yearOptions: this._buildYearOptions(),
                monthOptions: this._buildMonthOptions(),
                kpi: this._emptyProductKpi(),
                actualPlanKpi: this._emptyActualPlanKpi(),
                productRows: [],
                topRows: [],
                monthlyChart: [],
                segmentShareChart: [],
                structureChart: [],
                marginChart: [],
                actualPlanRows: [],
                actualPlanMonthlyChart: [],
                actualPlanProfitCenterChart: [],
                actualPlanVarianceChart: [],
                actualPlanValueHelp: {
                    segments: [],
                    profitCenters: [],
                    functionalAreas: []
                },
                drilldownRows: [],
                selectedProductTitle: "",
                selectedDrilldownTitle: "",
                productMessage: "",
                actualPlanMessage: "",
                segmentShareMessage: "",
                drilldownMessage: "",
                hasProductData: false,
                hasActualPlanData: false,
                hasPlanData: false
            };
        },

        onSearch: function () {
            if (!this._oViewModel) {
                return;
            }

            if (this._isActualPlanView()) {
                this._loadActualPlan();
                return;
            }

            this._loadProductData(this._isCockpitView());
        },

        onResetFilters: function () {
            var oDefaults = this._getDefaultFilterValues();
            this._oViewModel.setProperty("/filters", oDefaults);
            this.onSearch();
        },

        onGoCockpit: function () {
            this._navTo("RouteProfitabilityCockpit");
        },

        onGoProduct: function () {
            this._navTo("RouteProductProfitability");
        },

        onGoActualPlan: function () {
            this._navTo("RouteActualPlanProfitability");
        },

        onOpenProductDrilldown: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("app");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject();
            var oDialog = this.byId("drilldownDialog");
            this._oViewModel.setProperty("/selectedProductTitle", oRow.productOptionDisplay || this._formatProductKey(oRow));
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", "");

            if (oDialog) {
                this._oActiveDrilldownDialog = oDialog;
                oDialog.open();
            }

            this._loadJournalData(oRow);
        },

        onOpenProfitCenterDrilldown: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("app");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject();
            var oDialog = this.byId("profitCenterDrilldownDialog");

            this._oViewModel.setProperty("/selectedDrilldownTitle", [
                oRow.monat ? Number(oRow.monat) + "월" : "",
                oRow.prctrDisplay,
                oRow.segmentDisplay,
                oRow.fkberDisplay
            ].filter(function (sValue) {
                return sValue && sValue !== "-";
            }).join(" / ") || "-");
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", "");

            if (oDialog) {
                this._oActiveDrilldownDialog = oDialog;
                oDialog.open();
            }

            this._loadJournalData(oRow, "profitCenter");
        },

        onCloseDrilldown: function (oEvent) {
            var oSource = oEvent && oEvent.getSource && oEvent.getSource();
            var oEventDialog = this._findParentDialog(oSource);
            var aDialogs = [
                oEventDialog,
                this._oActiveDrilldownDialog,
                this.byId("drilldownDialog"),
                this.byId("profitCenterDrilldownDialog")
            ];
            var mClosed = {};

            aDialogs.forEach(function (oDialog) {
                var sId = oDialog && oDialog.getId && oDialog.getId();
                if (oDialog && oDialog.close && !mClosed[sId]) {
                    oDialog.close();
                    if (sId) {
                        mClosed[sId] = true;
                    }
                }
            });
        },

        _findParentDialog: function (oControl) {
            var oCurrent = oControl;

            while (oCurrent) {
                if (oCurrent.isA && oCurrent.isA("sap.m.Dialog")) {
                    return oCurrent;
                }
                oCurrent = oCurrent.getParent && oCurrent.getParent();
            }

            return null;
        },

        _getDefaultFilterValues: function () {
            var oNow = new Date();
            var sYear = String(oNow.getFullYear());
            var sMonth = String(oNow.getMonth() + 1).padStart(2, "0");

            return {
                companyCode: "0001",
                fiscalYear: sYear,
                month: sMonth,
                planVersion: "000",
                matnr: "",
                mtopt: "",
                mtart: "",
                matkl: "",
                segment: "",
                prctr: "",
                fkber: ""
            };
        },

        _buildYearOptions: function () {
            var iCurrentYear = new Date().getFullYear();
            var aYears = [];
            var iYear;

            for (iYear = iCurrentYear - 3; iYear <= iCurrentYear + 1; iYear += 1) {
                aYears.push({
                    key: String(iYear),
                    text: String(iYear)
                });
            }

            return aYears;
        },

        _buildMonthOptions: function () {
            var aMonths = [];
            var iMonth;

            for (iMonth = 1; iMonth <= 12; iMonth += 1) {
                aMonths.push({
                    key: String(iMonth).padStart(2, "0"),
                    text: iMonth + "월"
                });
            }

            return aMonths;
        },

        _emptyProductKpi: function () {
            return {
                sales: null,
                cogs: null,
                grossProfit: null,
                sgaPool: null,
                totalSalesBase: null,
                sgaAllocationRate: null,
                allocatedSga: null,
                operatingProfit: null,
                operatingProfitRate: null,
                grossProfitRate: null,
                allocationNote: "",
                currency: ""
            };
        },

        _emptyActualPlanKpi: function () {
            return {
                salesActual: null,
                salesPlan: null,
                salesDiff: null,
                operatingProfitActual: null,
                operatingProfitPlan: null,
                operatingProfitDiff: null,
                operatingProfitRateDiff: null,
                currency: ""
            };
        },

        _isCockpitView: function () {
            return this._sViewName && this._sViewName.indexOf("ProfitabilityCockpit") > -1;
        },

        _isActualPlanView: function () {
            return this._sViewName && this._sViewName.indexOf("ActualPlanProfitability") > -1;
        },

        _navTo: function (sRouteName) {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo(sRouteName);
        },

        _getOwnerModel: function (sName) {
            var oComponent = this.getOwnerComponent && this.getOwnerComponent();
            return oComponent && oComponent.getModel(sName);
        },

        _loadProductData: function (bLoadActualPlanSummary) {
            var oModel = this._getOwnerModel();
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = this._buildProductFilters();

            if (!oModel) {
                this._setProductError("제품/옵션 수익성 OData 모델을 찾을 수 없습니다.");
                return;
            }

            this._oViewModel.setProperty("/busy", true);
            this._oViewModel.setProperty("/productBusy", true);
            this._oViewModel.setProperty("/productMessage", "");

            this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"], {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            }, aODataFilters).then(function (aRows) {
                this._applyProductData(aRows);

                if (bLoadActualPlanSummary) {
                    this._loadActualPlan(true);
                }
            }.bind(this)).catch(function (oError) {
                this._setProductError(this._formatODataError(oError, "제품/옵션 수익성 데이터를 조회하지 못했습니다."));
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/busy", false);
                this._oViewModel.setProperty("/productBusy", false);
            }.bind(this));
        },

        _loadActualPlan: function (bSummaryOnly) {
            var oModel = this._getOwnerModel("actualPlan");
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = this._buildActualPlanFilters();

            if (!oModel) {
                this._setActualPlanError("실적/계획 비교 OData 모델을 찾을 수 없습니다.");
                return;
            }

            this._oViewModel.setProperty("/actualPlanBusy", true);
            this._oViewModel.setProperty("/actualPlanMessage", "");

            var mParameters = {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month,
                p_versn: oFilters.planVersion
            };
            var oDataPromise = this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to", "p_versn"],
                mParameters, aODataFilters);
            var oValueHelpPromise = this._hasActualPlanOptionalFilters(oFilters) ?
                this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to", "p_versn"], mParameters, []) :
                oDataPromise;

            Promise.all([oDataPromise, oValueHelpPromise]).then(function (aResults) {
                this._applyActualPlanData(aResults[0], aResults[1]);
            }.bind(this)).catch(function (oError) {
                var sMessage = this._formatODataError(oError, "실적/계획 비교 데이터를 조회하지 못했습니다.");
                if (!bSummaryOnly) {
                    this._setActualPlanError(sMessage);
                } else {
                    this._oViewModel.setProperty("/actualPlanMessage", sMessage);
                    this._oViewModel.setProperty("/segmentShareChart", []);
                    this._oViewModel.setProperty("/segmentShareMessage", sMessage);
                }
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/actualPlanBusy", false);
            }.bind(this));
        },

        _loadJournalData: function (oSourceRow, sMode) {
            var oModel = this._getOwnerModel("journal");
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = [];

            if (!oModel) {
                this._setDrilldownError("전표 상세 OData 모델을 찾을 수 없습니다.");
                return;
            }

            if (sMode === "profitCenter") {
                if (oSourceRow.prctr) {
                    aODataFilters.push(new Filter("prctr", FilterOperator.EQ, oSourceRow.prctr));
                }
                if (oSourceRow.segment) {
                    aODataFilters.push(new Filter("segment", FilterOperator.EQ, oSourceRow.segment));
                }
            } else {
                if (oSourceRow.matnr) {
                    aODataFilters.push(new Filter("matnr", FilterOperator.EQ, oSourceRow.matnr));
                }
                if (oSourceRow.mtopt) {
                    aODataFilters.push(new Filter("mtopt", FilterOperator.EQ, oSourceRow.mtopt));
                }
            }

            this._oViewModel.setProperty("/drilldownBusy", true);

            this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"], {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            }, aODataFilters).then(function (aRows) {
                var aDrilldownRows = this._sortJournalRows((aRows || []).map(this._decorateJournalRow, this));
                this._oViewModel.setProperty("/drilldownRows", aDrilldownRows);
                this._oViewModel.setProperty("/drilldownMessage", aDrilldownRows.length ? "" : "선택한 조건에 해당하는 전표 라인이 없습니다.");
            }.bind(this)).catch(function (oError) {
                this._setDrilldownError(this._formatODataError(oError, "전표 상세 데이터를 조회하지 못했습니다."));
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/drilldownBusy", false);
            }.bind(this));
        },

        _buildProductFilters: function () {
            var oFilters = this._oViewModel.getProperty("/filters");
            var aFilters = [];

            if (oFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.EQ, oFilters.matnr));
            }
            if (oFilters.mtopt) {
                aFilters.push(new Filter("mtopt", FilterOperator.EQ, oFilters.mtopt));
            }
            if (oFilters.mtart) {
                aFilters.push(new Filter("mtart", FilterOperator.EQ, oFilters.mtart));
            }
            if (oFilters.matkl) {
                aFilters.push(new Filter("matkl", FilterOperator.EQ, oFilters.matkl));
            }

            return aFilters;
        },

        _hasActualPlanOptionalFilters: function (oFilters) {
            return !!(oFilters && (oFilters.segment || oFilters.prctr || oFilters.fkber));
        },

        _buildActualPlanFilters: function () {
            var oFilters = this._oViewModel.getProperty("/filters");
            var aFilters = [];

            if (oFilters.segment) {
                aFilters.push(new Filter("segment", FilterOperator.EQ, oFilters.segment));
            }
            if (oFilters.prctr) {
                aFilters.push(new Filter("prctr", FilterOperator.EQ, oFilters.prctr));
            }
            if (oFilters.fkber) {
                aFilters.push(new Filter("fkber", FilterOperator.EQ, oFilters.fkber));
            }

            return aFilters;
        },

        _readParameterizedSet: function (oModel, aParameterNames, mParameters, aFilters) {
            return this._resolveParameterizedEndpoint(oModel, aParameterNames).then(function (oEndpoint) {
                if (oEndpoint.direct) {
                    return this._readDirectSet(oModel, oEndpoint, mParameters, aFilters);
                }

                return new Promise(function (resolve, reject) {
                    var aEndpointParameterNames = oEndpoint.parameterNames || aParameterNames;
                    var sKeyPredicate = aEndpointParameterNames.map(function (sName) {
                        return sName + "=" + this._encodeODataString(mParameters[sName]);
                    }.bind(this)).join(",");
                    var sPath = "/" + oEndpoint.entitySet + "(" + sKeyPredicate + ")/" + oEndpoint.navigationProperty;

                    oModel.read(sPath, {
                        filters: aFilters || [],
                        success: function (oData) {
                            resolve(oData && oData.results ? oData.results : []);
                        },
                        error: reject
                    });
                }.bind(this));
            }.bind(this));
        },

        _readDirectSet: function (oModel, oEndpoint, mParameters, aFilters) {
            return new Promise(function (resolve, reject) {
                oModel.read("/" + oEndpoint.entitySet, {
                    filters: this._buildDirectSetFilters(oEndpoint, mParameters, aFilters),
                    success: function (oData) {
                        resolve(oData && oData.results ? oData.results : []);
                    },
                    error: reject
                });
            }.bind(this));
        },

        _buildDirectSetFilters: function (oEndpoint, mParameters, aFilters) {
            var aDirectFilters = (aFilters || []).slice();
            var sBukrsProperty = this._findEndpointProperty(oEndpoint, ["bukrs", "BUKRS"]);
            var sGjahrProperty = this._findEndpointProperty(oEndpoint, ["gjahr", "GJAHR"]);
            var sMonatProperty = this._findEndpointProperty(oEndpoint, ["monat", "MONAT"]);
            var sVersionProperty = this._findEndpointProperty(oEndpoint, ["versn", "VERSN", "version", "VERSION"]);

            if (sBukrsProperty && mParameters.p_bukrs) {
                aDirectFilters.push(new Filter(sBukrsProperty, FilterOperator.EQ, mParameters.p_bukrs));
            }
            if (sGjahrProperty && mParameters.p_gjahr) {
                aDirectFilters.push(new Filter(sGjahrProperty, FilterOperator.EQ, mParameters.p_gjahr));
            }
            if (sMonatProperty && mParameters.p_monat_from && mParameters.p_monat_to) {
                if (mParameters.p_monat_from === mParameters.p_monat_to) {
                    aDirectFilters.push(new Filter(sMonatProperty, FilterOperator.EQ, mParameters.p_monat_from));
                } else {
                    aDirectFilters.push(new Filter(sMonatProperty, FilterOperator.GE, mParameters.p_monat_from));
                    aDirectFilters.push(new Filter(sMonatProperty, FilterOperator.LE, mParameters.p_monat_to));
                }
            }
            if (sVersionProperty && mParameters.p_versn) {
                aDirectFilters.push(new Filter(sVersionProperty, FilterOperator.EQ, mParameters.p_versn));
            }

            return aDirectFilters;
        },

        _resolveParameterizedEndpoint: function (oModel, aParameterNames) {
            var sCacheKey = (oModel.sServiceUrl || "") + "::" + aParameterNames.join("|");

            if (this._mEndpointCache[sCacheKey]) {
                return Promise.resolve(this._mEndpointCache[sCacheKey]);
            }

            return this._waitForMetadata(oModel).then(function () {
                var oEndpoint = this._findParameterizedEndpoint(oModel.getServiceMetadata(), aParameterNames);

                if (!oEndpoint) {
                    throw new Error("Parameterized CDS metadata 구조를 찾을 수 없습니다.");
                }

                this._mEndpointCache[sCacheKey] = oEndpoint;
                return oEndpoint;
            }.bind(this));
        },

        _waitForMetadata: function (oModel) {
            if (oModel.getServiceMetadata && oModel.getServiceMetadata()) {
                return Promise.resolve();
            }

            if (oModel.isMetadataLoadingFailed && oModel.isMetadataLoadingFailed()) {
                return Promise.reject(this._createMetadataError(null, oModel.sServiceUrl));
            }

            return new Promise(function (resolve, reject) {
                var bSettled = false;
                var fnMetadataFailed;
                var fnCleanup = function () {
                    if (oModel.detachMetadataFailed && fnMetadataFailed) {
                        oModel.detachMetadataFailed(fnMetadataFailed);
                    }
                };
                var fnResolve = function () {
                    if (bSettled) {
                        return;
                    }
                    bSettled = true;
                    fnCleanup();
                    resolve();
                };

                fnMetadataFailed = function (oEvent) {
                    if (bSettled) {
                        return;
                    }
                    bSettled = true;
                    fnCleanup();
                    reject(this._createMetadataError(oEvent, oModel.sServiceUrl));
                }.bind(this);

                if (oModel.attachMetadataFailed) {
                    oModel.attachMetadataFailed(fnMetadataFailed);
                }

                oModel.metadataLoaded().then(fnResolve).catch(fnMetadataFailed);
            }.bind(this));
        },

        _createMetadataError: function (oEvent, sServiceUrl) {
            var oResponse = oEvent && oEvent.getParameter && oEvent.getParameter("response") || {};
            var sStatus = oResponse.statusCode || oResponse.status || "";
            var sStatusText = oResponse.statusText || oResponse.status || "";
            var sMessage = "OData metadata를 불러오지 못했습니다.";

            if (sServiceUrl) {
                sMessage += " 서비스: " + sServiceUrl;
            }
            if (sStatus || sStatusText) {
                sMessage += " (" + [sStatus, sStatusText].filter(Boolean).join(" ") + ")";
            }

            return {
                message: sMessage,
                statusCode: sStatus,
                statusText: sStatusText,
                responseText: oResponse.responseText || oResponse.body || ""
            };
        },

        _findParameterizedEndpoint: function (oMetadata, aParameterNames) {
            var aSchemas = this._asArray(oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema);
            var oSchema;
            var oEntityType;
            var oEntitySet;
            var i;

            for (i = 0; i < aSchemas.length; i += 1) {
                oSchema = aSchemas[i];
                oEntityType = this._findParameterEntityType(oSchema, aParameterNames);
                if (!oEntityType) {
                    continue;
                }

                oEntitySet = this._findEntitySetForType(oSchema, oEntityType.name);
                if (!oEntitySet) {
                    continue;
                }

                return {
                    entitySet: oEntitySet.name,
                    navigationProperty: this._findResultNavigation(oEntityType),
                    parameterNames: this._getExistingPropertyNames(oEntityType, aParameterNames)
                };
            }

            return this._findDirectEndpoint(oMetadata);
        },

        _findParameterEntityType: function (oSchema, aParameterNames) {
            var aEntityTypes = this._asArray(oSchema.entityType);
            var aExactCandidates = aEntityTypes.filter(function (oEntityType) {
                return this._entityHasProperties(oEntityType, aParameterNames) &&
                    this._asArray(oEntityType.navigationProperty).length > 0;
            }.bind(this));
            var aPartialCandidates;

            if (aExactCandidates.length) {
                return aExactCandidates.filter(function (oEntityType) {
                    return /Parameters$/i.test(oEntityType.name || "");
                })[0] || aExactCandidates[0];
            }

            aPartialCandidates = aEntityTypes.filter(function (oEntityType) {
                return this._asArray(oEntityType.navigationProperty).length > 0 &&
                    this._getExistingPropertyNames(oEntityType, aParameterNames).length >= Math.max(1, aParameterNames.length - 1);
            }.bind(this));

            return aPartialCandidates.filter(function (oEntityType) {
                return /Parameters$/i.test(oEntityType.name || "");
            })[0] || aPartialCandidates[0];
        },

        _findDirectEndpoint: function (oMetadata) {
            var aSchemas = this._asArray(oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema);
            var aResultFieldGroups = [
                ["actual_sales_amt", "actual_operating_profit_amt"],
                ["sales_amt", "operating_profit_amt"],
                ["belnr", "docln"]
            ];
            var i;
            var oSchema;
            var aEntityTypes;
            var oEntityType;
            var oEntitySet;
            var j;

            for (i = 0; i < aSchemas.length; i += 1) {
                oSchema = aSchemas[i];
                aEntityTypes = this._asArray(oSchema.entityType);

                for (j = 0; j < aEntityTypes.length; j += 1) {
                    oEntityType = aEntityTypes[j];
                    if (this._asArray(oEntityType.navigationProperty).length > 0) {
                        continue;
                    }
                    if (!aResultFieldGroups.some(function (aFields) {
                            return this._entityHasProperties(oEntityType, aFields);
                        }.bind(this))) {
                        continue;
                    }

                    oEntitySet = this._findEntitySetForType(oSchema, oEntityType.name);
                    if (oEntitySet) {
                        return {
                            direct: true,
                            entitySet: oEntitySet.name,
                            properties: this._getEntityPropertyNames(oEntityType)
                        };
                    }
                }
            }

            return null;
        },

        _findEntitySetForType: function (oSchema, sEntityTypeName) {
            var aContainers = this._asArray(oSchema.entityContainer);
            var sQualifiedTypeName = oSchema.namespace + "." + sEntityTypeName;
            var i;
            var aEntitySets;
            var oEntitySet;

            for (i = 0; i < aContainers.length; i += 1) {
                aEntitySets = this._asArray(aContainers[i].entitySet);
                oEntitySet = aEntitySets.filter(function (oSet) {
                    return oSet.entityType === sQualifiedTypeName;
                })[0];

                if (oEntitySet) {
                    return oEntitySet;
                }
            }

            return null;
        },

        _findResultNavigation: function (oEntityType) {
            var aNavigationProperties = this._asArray(oEntityType.navigationProperty);
            var oSetNavigation = aNavigationProperties.filter(function (oNavigationProperty) {
                return oNavigationProperty.name === "Set";
            })[0];

            return (oSetNavigation || aNavigationProperties[0]).name;
        },

        _entityHasProperties: function (oEntityType, aPropertyNames) {
            var aProperties = this._getEntityPropertyNames(oEntityType);

            return aPropertyNames.every(function (sName) {
                return aProperties.indexOf(sName) > -1;
            });
        },

        _getExistingPropertyNames: function (oEntityType, aPropertyNames) {
            var aProperties = this._getEntityPropertyNames(oEntityType);

            return aPropertyNames.filter(function (sName) {
                return aProperties.indexOf(sName) > -1;
            });
        },

        _getEntityPropertyNames: function (oEntityType) {
            return this._asArray(oEntityType && oEntityType.property).map(function (oProperty) {
                return oProperty.name;
            });
        },

        _findEndpointProperty: function (oEndpoint, aPropertyNames) {
            var aProperties = oEndpoint && oEndpoint.properties || [];
            var i;

            for (i = 0; i < aPropertyNames.length; i += 1) {
                if (aProperties.indexOf(aPropertyNames[i]) > -1) {
                    return aPropertyNames[i];
                }
            }

            return "";
        },

        _asArray: function (vValue) {
            if (!vValue) {
                return [];
            }
            return Array.isArray(vValue) ? vValue : [vValue];
        },

        _encodeODataString: function (vValue) {
            return "'" + String(vValue || "").replace(/'/g, "''") + "'";
        },

        _applyProductData: function (aRows) {
            var aProductRows = (aRows || []).map(function (oRow) {
                var oMapped = this._decorateProductText(oRow);

                oMapped.sales = this._toNumber(oRow.sales_amt);
                oMapped.cogs = this._toNumber(oRow.cogs_amt);
                oMapped.grossProfit = this._toNumber(oRow.gross_profit_amt);
                oMapped.grossProfitRate = this._toNumber(oRow.gross_profit_rate);
                oMapped.variance = this._toNumber(oRow.variance_amt);
                oMapped.sgaPool = this._toNumber(oRow.sga_pool_amt);
                oMapped.totalSalesBase = this._toNumber(oRow.total_sales_base_amt);
                oMapped.sgaAllocationRate = this._toNumber(oRow.sga_allocation_rate);
                oMapped.allocatedSga = this._toNumber(oRow.allocated_sga_amt);
                oMapped.operatingProfit = this._toNumber(oRow.operating_profit_amt);
                oMapped.operatingProfitRate = this._toNumber(oRow.operating_profit_rate);
                oMapped.allocationNote = this._readField(oRow, "allocation_note");
                oMapped.profitState = formatter.stateByAmount(oMapped.operatingProfit);
                oMapped.rateState = formatter.stateByRate(oMapped.operatingProfitRate);

                return oMapped;
            }.bind(this));

            aProductRows.sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.operatingProfit) - this._sortNumber(oLeft.operatingProfit) ||
                    this._sortNumber(oRight.sales) - this._sortNumber(oLeft.sales) ||
                    String(oLeft.productDisplay || "").localeCompare(String(oRight.productDisplay || ""));
            }.bind(this));

            var oKpi = this._calculateProductKpi(aProductRows);
            var aTopRows = aProductRows.slice(0, 10);

            this._oViewModel.setProperty("/productRows", aProductRows);
            this._oViewModel.setProperty("/topRows", aTopRows);
            this._oViewModel.setProperty("/kpi", oKpi);
            this._oViewModel.setProperty("/monthlyChart", this._buildMonthlyChart(oKpi));
            this._oViewModel.setProperty("/structureChart", this._buildStructureChart(oKpi));
            this._oViewModel.setProperty("/marginChart", this._buildMarginChart(aProductRows));
            this._oViewModel.setProperty("/hasProductData", aProductRows.length > 0);
            this._oViewModel.setProperty("/productMessage", aProductRows.length ? "" : "조회 조건에 해당하는 제품/옵션 수익성 데이터가 없습니다.");
        },

        _calculateProductKpi: function (aRows) {
            var oKpi = this._emptyProductKpi();

            oKpi.sales = this._sum(aRows, "sales");
            oKpi.cogs = this._sum(aRows, "cogs");
            oKpi.grossProfit = this._sum(aRows, "grossProfit");
            oKpi.operatingProfit = this._sum(aRows, "operatingProfit");
            oKpi.variance = this._sum(aRows, "variance");
            oKpi.sgaPool = this._firstNumber(aRows, "sgaPool");
            oKpi.totalSalesBase = this._firstNumber(aRows, "totalSalesBase");
            oKpi.allocatedSga = this._sum(aRows, "allocatedSga");
            oKpi.sgaAllocationRate = this._isFiniteNumber(oKpi.totalSalesBase) && oKpi.totalSalesBase !== 0 &&
                this._isFiniteNumber(oKpi.sales) ? oKpi.sales / oKpi.totalSalesBase : null;
            oKpi.allocationNote = this._firstText(aRows, "allocationNote");
            oKpi.currency = this._firstText(aRows, "waers");

            if (this._isFiniteNumber(oKpi.sales) && oKpi.sales !== 0) {
                oKpi.grossProfitRate = this._isFiniteNumber(oKpi.grossProfit) ? oKpi.grossProfit / oKpi.sales : null;
                oKpi.operatingProfitRate = this._isFiniteNumber(oKpi.operatingProfit) ? oKpi.operatingProfit / oKpi.sales : null;
            }

            return oKpi;
        },

        _buildMonthlyChart: function (oKpi) {
            var oFilters = this._oViewModel.getProperty("/filters");

            if (!this._isFiniteNumber(oKpi.sales) && !this._isFiniteNumber(oKpi.operatingProfit)) {
                return [];
            }

            return [{
                monthText: Number(oFilters.month) + "월",
                structureText: "손익",
                sales: oKpi.sales,
                cogs: oKpi.cogs,
                grossProfit: oKpi.grossProfit,
                sga: this._isFiniteNumber(oKpi.allocatedSga) ? -Math.abs(oKpi.allocatedSga) : null,
                operatingProfit: oKpi.operatingProfit
            }];
        },

        _buildStructureChart: function (oKpi) {
            if (!this._isFiniteNumber(oKpi.sales) && !this._isFiniteNumber(oKpi.operatingProfit)) {
                return [];
            }

            return [{
                item: "매출",
                amount: oKpi.sales
            }, {
                item: "매출원가",
                amount: this._isFiniteNumber(oKpi.cogs) ? -Math.abs(oKpi.cogs) : null
            }, {
                item: "매출총이익",
                amount: oKpi.grossProfit
            }, {
                item: "판관비",
                amount: this._isFiniteNumber(oKpi.allocatedSga) ? -Math.abs(oKpi.allocatedSga) : null
            }, {
                item: "영업이익",
                amount: oKpi.operatingProfit
            }];
        },

        _buildMarginChart: function (aRows) {
            var mGroups = {};

            (aRows || []).forEach(function (oRow) {
                var sGroup = oRow.materialGroupDisplay || "-";

                if (!mGroups[sGroup]) {
                    mGroups[sGroup] = {
                        productKey: sGroup,
                        sales: 0,
                        grossProfit: 0,
                        operatingProfit: 0
                    };
                }

                mGroups[sGroup].sales += this._isFiniteNumber(oRow.sales) ? Number(oRow.sales) : 0;
                mGroups[sGroup].grossProfit += this._isFiniteNumber(oRow.grossProfit) ? Number(oRow.grossProfit) : 0;
                mGroups[sGroup].operatingProfit += this._isFiniteNumber(oRow.operatingProfit) ? Number(oRow.operatingProfit) : 0;
            }.bind(this));

            return Object.keys(mGroups).map(function (sGroup) {
                var oGroup = mGroups[sGroup];
                var bHasSales = this._isFiniteNumber(oGroup.sales) && oGroup.sales !== 0;

                return {
                    productKey: oGroup.productKey,
                    sales: oGroup.sales,
                    grossProfitRate: bHasSales ? oGroup.grossProfit / oGroup.sales * 100 : null,
                    operatingProfitRate: bHasSales ? oGroup.operatingProfit / oGroup.sales * 100 : null
                };
            }.bind(this)).filter(function (oGroup) {
                return this._isFiniteNumber(oGroup.grossProfitRate) || this._isFiniteNumber(oGroup.operatingProfitRate);
            }.bind(this)).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.sales) - this._sortNumber(oLeft.sales) ||
                    String(oLeft.productKey || "").localeCompare(String(oRight.productKey || ""));
            }.bind(this)).slice(0, 12);
        },

        _mapActualPlanRows: function (aRows) {
            return (aRows || []).map(function (oRow) {
                var oMapped = this._decorateOrgText(oRow);

                oMapped.actualSales = this._toNumber(this._readField(oRow, "actual_sales_amt"));
                oMapped.actualCogs = this._toNumber(this._readField(oRow, "actual_cogs_amt"));
                oMapped.actualGrossProfit = this._toNumber(this._readField(oRow, "actual_gross_profit_amt"));
                oMapped.actualGrossProfitRate = this._toNumber(this._readField(oRow, "actual_gross_profit_rate"));
                oMapped.actualSga = this._toNumber(this._readField(oRow, "actual_sga_amt"));
                oMapped.actualOperatingProfit = this._toNumber(this._readField(oRow, "actual_operating_profit_amt"));
                oMapped.actualOperatingProfitRate = this._toNumber(this._readField(oRow, "actual_operating_profit_rate"));
                oMapped.actualVariance = this._toNumber(this._readField(oRow, "actual_variance_amt"));
                oMapped.planSales = this._toNumber(this._readField(oRow, "plan_sales_amt"));
                oMapped.planCogs = this._toNumber(this._readField(oRow, "plan_cogs_amt"));
                oMapped.planGrossProfit = this._toNumber(this._readField(oRow, "plan_gross_profit_amt"));
                oMapped.planGrossProfitRate = this._toNumber(this._readField(oRow, "plan_gross_profit_rate"));
                oMapped.planSga = this._toNumber(this._readField(oRow, "plan_sga_amt"));
                oMapped.planOperatingProfit = this._toNumber(this._readField(oRow, "plan_operating_profit_amt"));
                oMapped.planOperatingProfitRate = this._toNumber(this._readField(oRow, "plan_operating_profit_rate"));
                oMapped.planVariance = this._toNumber(this._readField(oRow, "plan_variance_amt"));
                oMapped.salesDiff = this._toNumber(this._readField(oRow, "sales_diff_amt"));
                oMapped.grossProfitDiff = this._toNumber(this._readField(oRow, "gross_profit_diff_amt"));
                oMapped.sgaDiff = this._toNumber(this._readField(oRow, "sga_diff_amt"));
                oMapped.operatingProfitDiff = this._toNumber(this._readField(oRow, "operating_profit_diff_amt"));
                oMapped.varianceDiff = this._toNumber(this._readField(oRow, "variance_diff_amt"));
                oMapped.salesAchievementRate = this._toNumber(this._readField(oRow, "sales_achievement_rate"));
                oMapped.opProfitAchievementRate = this._toNumber(this._readField(oRow, "op_profit_achievement_rate"));
                oMapped.analysisNote = this._readField(oRow, "analysis_note");
                oMapped.salesDiffState = formatter.stateByAmount(oMapped.salesDiff);
                oMapped.grossProfitDiffState = formatter.stateByAmount(oMapped.grossProfitDiff);
                oMapped.sgaDiffState = formatter.stateByAmount(oMapped.sgaDiff);
                oMapped.operatingProfitDiffState = formatter.stateByAmount(oMapped.operatingProfitDiff);
                oMapped.varianceDiffState = formatter.stateByAmount(oMapped.varianceDiff);

                return oMapped;
            }.bind(this)).sort(function (oLeft, oRight) {
                return String(oLeft.monat || "").localeCompare(String(oRight.monat || "")) ||
                    String(oLeft.segmentDisplay || "").localeCompare(String(oRight.segmentDisplay || "")) ||
                    String(oLeft.prctrDisplay || "").localeCompare(String(oRight.prctrDisplay || "")) ||
                    String(oLeft.fkberDisplay || "").localeCompare(String(oRight.fkberDisplay || ""));
            });
        },

        _applyActualPlanData: function (aRows, aValueHelpRows) {
            var aActualPlanRows = this._mapActualPlanRows(aRows);
            var aActualPlanValueHelpRows = aValueHelpRows === aRows ? aActualPlanRows : this._mapActualPlanRows(aValueHelpRows);
            var oKpi = this._calculateActualPlanKpi(aActualPlanRows);

            this._oViewModel.setProperty("/actualPlanRows", aActualPlanRows);
            this._oViewModel.setProperty("/actualPlanKpi", oKpi);
            this._oViewModel.setProperty("/actualPlanMonthlyChart", this._buildActualPlanMonthlyChart(aActualPlanRows));
            this._oViewModel.setProperty("/actualPlanProfitCenterChart", this._buildProfitCenterChart(aActualPlanRows));
            this._oViewModel.setProperty("/actualPlanVarianceChart", this._buildActualPlanVarianceChart(aActualPlanRows));
            this._oViewModel.setProperty("/actualPlanValueHelp", this._buildActualPlanValueHelp(aActualPlanValueHelpRows));
            this._applySegmentShareData(aActualPlanRows);
            this._oViewModel.setProperty("/hasActualPlanData", aActualPlanRows.length > 0);
            this._oViewModel.setProperty("/hasPlanData", this._rowsHaveAnyNumber(aActualPlanRows, [
                "planSales",
                "planOperatingProfit"
            ]));
            this._oViewModel.setProperty("/actualPlanMessage", aActualPlanRows.length ? "" : "조회 조건에 해당하는 실적/계획 데이터가 없습니다.");
        },

        _applySegmentShareData: function (aRows) {
            var aSegmentRows = this._buildSegmentShareChart(aRows);

            this._oViewModel.setProperty("/segmentShareChart", aSegmentRows);
            this._oViewModel.setProperty("/segmentShareMessage", aSegmentRows.length ? "" :
                "사업부문 기준 매출 데이터가 없습니다. 0046 서비스에 actual_sales_amt와 사업부문이 내려와야 표시됩니다.");
        },

        _calculateActualPlanKpi: function (aRows) {
            var oKpi = this._emptyActualPlanKpi();

            oKpi.salesActual = this._sum(aRows, "actualSales");
            oKpi.salesPlan = this._sum(aRows, "planSales");
            oKpi.salesDiff = this._sum(aRows, "salesDiff");
            oKpi.operatingProfitActual = this._sum(aRows, "actualOperatingProfit");
            oKpi.operatingProfitPlan = this._sum(aRows, "planOperatingProfit");
            oKpi.operatingProfitDiff = this._sum(aRows, "operatingProfitDiff");
            oKpi.currency = this._firstText(aRows, "waers");

            if (this._isFiniteNumber(oKpi.salesActual) && oKpi.salesActual !== 0 &&
                    this._isFiniteNumber(oKpi.salesPlan) && oKpi.salesPlan !== 0) {
                oKpi.operatingProfitRateDiff = (oKpi.operatingProfitActual / oKpi.salesActual) -
                    (oKpi.operatingProfitPlan / oKpi.salesPlan);
            }

            return oKpi;
        },

        _buildActualPlanMonthlyChart: function (aRows) {
            var mByMonth = {};

            aRows.forEach(function (oRow) {
                var sMonth = oRow.monat || "";
                if (!mByMonth[sMonth]) {
                    mByMonth[sMonth] = {
                        monthText: sMonth ? Number(sMonth) + "월" : "-",
                        actual: null,
                        plan: null
                    };
                }

                mByMonth[sMonth].actual = this._addNullable(mByMonth[sMonth].actual, oRow.actualOperatingProfit);
                mByMonth[sMonth].plan = this._addNullable(mByMonth[sMonth].plan, oRow.planOperatingProfit);
            }.bind(this));

            return Object.keys(mByMonth).sort().map(function (sMonth) {
                return mByMonth[sMonth];
            });
        },

        _buildProfitCenterChart: function (aRows) {
            var mByProfitCenter = {};

            aRows.forEach(function (oRow) {
                var sKey = oRow.prctrDisplay || oRow.prctr || "-";

                if (!this._isFiniteNumber(oRow.actualOperatingProfit)) {
                    return;
                }

                if (!mByProfitCenter[sKey]) {
                    mByProfitCenter[sKey] = {
                        profitCenter: sKey,
                        actualOperatingProfit: null,
                        waers: oRow.waers || ""
                    };
                }

                mByProfitCenter[sKey].actualOperatingProfit = this._addNullable(
                    mByProfitCenter[sKey].actualOperatingProfit,
                    oRow.actualOperatingProfit
                );
            }.bind(this));

            var aGroups = Object.keys(mByProfitCenter).map(function (sKey) {
                return mByProfitCenter[sKey];
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualOperatingProfit) - this._sortNumber(oLeft.actualOperatingProfit) ||
                    String(oLeft.profitCenter || "").localeCompare(String(oRight.profitCenter || ""));
            }.bind(this));
            var aTop = aGroups.slice(0, 5);
            var aBottom = aGroups.slice().reverse().slice(0, 5);
            var mSeen = {};

            return aTop.concat(aBottom).filter(function (oGroup) {
                if (mSeen[oGroup.profitCenter]) {
                    return false;
                }
                mSeen[oGroup.profitCenter] = true;
                return true;
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualOperatingProfit) - this._sortNumber(oLeft.actualOperatingProfit) ||
                    String(oLeft.profitCenter || "").localeCompare(String(oRight.profitCenter || ""));
            }.bind(this));
        },

        _buildActualPlanVarianceChart: function (aRows) {
            return [{
                item: "매출 차이",
                diff: this._sum(aRows, "salesDiff")
            }, {
                item: "매출총이익 차이",
                diff: this._sum(aRows, "grossProfitDiff")
            }, {
                item: "판관비 차이",
                diff: this._sum(aRows, "sgaDiff")
            }, {
                item: "영업이익 차이",
                diff: this._sum(aRows, "operatingProfitDiff")
            }, {
                item: "제조/차이 계정 차이",
                diff: this._sum(aRows, "varianceDiff")
            }].filter(function (oItem) {
                return this._isFiniteNumber(oItem.diff);
            }.bind(this));
        },

        _buildActualPlanValueHelp: function (aRows) {
            return {
                segments: this._buildUniqueOptions(aRows, "segment", "segmentDisplay"),
                profitCenters: this._buildUniqueOptions(aRows, "prctr", "prctrDisplay"),
                functionalAreas: this._buildUniqueOptions(aRows, "fkber", "fkberDisplay")
            };
        },

        _buildUniqueOptions: function (aRows, sKeyProperty, sTextProperty) {
            var mOptions = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = this._cleanText(oRow[sKeyProperty]);
                var sText = this._cleanText(oRow[sTextProperty]);

                if (!sKey) {
                    return;
                }
                if (!mOptions[sKey]) {
                    mOptions[sKey] = {
                        key: sKey,
                        text: sText || sKey
                    };
                } else if ((!mOptions[sKey].text || mOptions[sKey].text === sKey) && sText) {
                    mOptions[sKey].text = sText;
                }
            }.bind(this));

            return Object.keys(mOptions).map(function (sKey) {
                return mOptions[sKey];
            }).sort(function (oLeft, oRight) {
                return String(oLeft.text || "").localeCompare(String(oRight.text || ""));
            });
        },

        _rowsHaveAnyNumber: function (aRows, aProperties) {
            return (aRows || []).some(function (oRow) {
                return aProperties.some(function (sProperty) {
                    return this._isFiniteNumber(oRow[sProperty]);
                }.bind(this));
            }.bind(this));
        },

        _buildSegmentShareChart: function (aRows) {
            var mBySegment = {};
            var fTotal = 0;

            aRows.filter(function (oRow) {
                return oRow.segment &&
                    this._isFiniteNumber(oRow.actualSales) &&
                    oRow.actualSales !== 0;
            }.bind(this)).forEach(function (oRow) {
                var sSegment = String(oRow.segment).trim();
                var sSegmentText = this._cleanText(oRow.segment_txt);
                var fAmount = Math.abs(Number(oRow.actualSales));

                if (!mBySegment[sSegment]) {
                    mBySegment[sSegment] = {
                        segment: sSegment,
                        segment_txt: sSegmentText,
                        segmentDisplay: this._formatTextOnly(sSegmentText),
                        amount: 0,
                        share: null,
                        waers: oRow.waers || ""
                    };
                } else if (!mBySegment[sSegment].segment_txt && sSegmentText) {
                    mBySegment[sSegment].segment_txt = sSegmentText;
                    mBySegment[sSegment].segmentDisplay = this._formatTextOnly(sSegmentText);
                }

                mBySegment[sSegment].amount += fAmount;
                fTotal += fAmount;
            }.bind(this));

            if (!fTotal) {
                return [];
            }

            return Object.keys(mBySegment).map(function (sSegment) {
                var oSegment = mBySegment[sSegment];
                oSegment.share = oSegment.amount / fTotal;
                oSegment.sharePercent = oSegment.share * 100;
                return oSegment;
            }).sort(function (oLeft, oRight) {
                return oRight.amount - oLeft.amount;
            });
        },

        _setProductError: function (sMessage) {
            this._oViewModel.setProperty("/productRows", []);
            this._oViewModel.setProperty("/topRows", []);
            this._oViewModel.setProperty("/monthlyChart", []);
            this._oViewModel.setProperty("/segmentShareChart", []);
            this._oViewModel.setProperty("/structureChart", []);
            this._oViewModel.setProperty("/marginChart", []);
            this._oViewModel.setProperty("/kpi", this._emptyProductKpi());
            this._oViewModel.setProperty("/hasProductData", false);
            this._oViewModel.setProperty("/productMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _setActualPlanError: function (sMessage) {
            this._oViewModel.setProperty("/actualPlanRows", []);
            this._oViewModel.setProperty("/actualPlanMonthlyChart", []);
            this._oViewModel.setProperty("/actualPlanProfitCenterChart", []);
            this._oViewModel.setProperty("/actualPlanVarianceChart", []);
            this._oViewModel.setProperty("/actualPlanValueHelp", {
                segments: [],
                profitCenters: [],
                functionalAreas: []
            });
            this._oViewModel.setProperty("/segmentShareChart", []);
            this._oViewModel.setProperty("/actualPlanKpi", this._emptyActualPlanKpi());
            this._oViewModel.setProperty("/hasActualPlanData", false);
            this._oViewModel.setProperty("/hasPlanData", false);
            this._oViewModel.setProperty("/actualPlanMessage", sMessage);
            this._oViewModel.setProperty("/segmentShareMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _setDrilldownError: function (sMessage) {
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _formatODataError: function (oError, sFallbackMessage) {
            var sMessage = oError && oError.message || sFallbackMessage;
            var oPayload;
            var sResponseText = oError && (oError.responseText || oError.body);
            var sStatus = oError && (oError.statusCode || oError.status || oError.statusText);

            try {
                oPayload = sResponseText ? JSON.parse(sResponseText) : null;
                sMessage = oPayload && oPayload.error && oPayload.error.message &&
                    (oPayload.error.message.value || oPayload.error.message) || sMessage;
            } catch (e) {
                if (sResponseText && sResponseText.indexOf("<html") !== 0) {
                    sMessage = sResponseText;
                }
            }

            if (sStatus && sMessage.indexOf(String(sStatus)) === -1) {
                sMessage += " (" + sStatus + ")";
            }

            return sMessage;
        },

        _decorateJournalRow: function (oRow) {
            var oMapped = this._decorateOrgText(this._decorateProductText(oRow));
            var oRole = this._accountRoleInfo(this._readField(oMapped, "racct"));

            oMapped.accountRoleKey = oRole.key;
            oMapped.accountRoleText = oRole.text;
            oMapped.accountRoleDetail = oRole.detail;
            oMapped.isFinalManufacturingAccount = oRole.finalManufacturing;
            oMapped.isSourceActualAccount = oRole.sourceActual;
            oMapped.processStepInfo = this._accountProcessStepInfo(this._readField(oMapped, "racct"), oMapped, oRole);
            oMapped.processStepText = oMapped.processStepInfo.text;
            oMapped.processStepDetail = oMapped.processStepInfo.detail;
            oMapped.finalManufacturingText = oMapped.processStepInfo.finalManufacturingRelevant ? "반영" : "미반영";

            return oMapped;
        },

        _sortJournalRows: function (aRows) {
            return (aRows || []).slice().sort(function (oLeft, oRight) {
                return this._journalRoleRank(oLeft.accountRoleKey) - this._journalRoleRank(oRight.accountRoleKey) ||
                    String(oLeft.budat || "").localeCompare(String(oRight.budat || "")) ||
                    String(oLeft.belnr || "").localeCompare(String(oRight.belnr || "")) ||
                    String(oLeft.docln || "").localeCompare(String(oRight.docln || ""));
            }.bind(this));
        },

        _journalRoleRank: function (sRoleKey) {
            var mRank = {
                REVENUE: 0,
                COGS: 1,
                SGA: 2,
                MATERIAL: 3,
                MANUFACTURING_RECEIPT: 4,
                STANDARD_PROCESSING: 5,
                PRODUCTION_ABSORPTION: 6,
                ALLOCATION_VARIANCE: 7,
                PRICE_VARIANCE: 8,
                SOURCE_ACTUAL: 9,
                SOURCE_ACTUAL_EXCLUDED: 10,
                OTHER: 99
            };

            return mRank[sRoleKey] !== undefined ? mRank[sRoleKey] : 99;
        },

        _decorateProductText: function (oRow) {
            var oMapped = Object.assign({}, oRow);
            var sMatnr = this._readField(oMapped, "matnr");
            var sMtopt = this._readField(oMapped, "mtopt");
            var sMaktx = this._readField(oMapped, "maktx");
            var sMtoptText = this._readField(oMapped, "mtopt_t");
            var sMtart = this._readField(oMapped, "mtart");
            var sMtbez = this._readField(oMapped, "mtbez");
            var sMatkl = this._readField(oMapped, "matkl");
            var sWgbez = this._readField(oMapped, "wgbez");
            var sMatMeins = this._readField(oMapped, "mat_meins");

            oMapped.maktx = sMaktx;
            oMapped.mtopt_t = sMtoptText;
            oMapped.mtart = sMtart;
            oMapped.mtbez = sMtbez;
            oMapped.matkl = sMatkl;
            oMapped.wgbez = sWgbez;
            oMapped.mat_meins = sMatMeins;
            oMapped.productDisplay = this._formatTextOnly(sMaktx);
            oMapped.optionDisplay = this._formatOptionText(sMtopt, sMtoptText);
            oMapped.materialTypeDisplay = this._formatTextOnly(sMtbez);
            oMapped.materialGroupDisplay = this._formatTextOnly(sWgbez);
            oMapped.productOptionDisplay = [oMapped.productDisplay, oMapped.optionDisplay]
                .filter(function (sValue) {
                    return sValue && sValue !== "-";
                })
                .join(" / ") || "-";
            oMapped.productKey = oMapped.productOptionDisplay;

            return oMapped;
        },

        _decorateOrgText: function (oRow) {
            var oMapped = Object.assign({}, oRow);
            var sSegment = this._readField(oMapped, "segment");
            var sSegmentText = this._readField(oMapped, "segment_txt");
            var sPrctr = this._readField(oMapped, "prctr");
            var sPrctrText = this._readField(oMapped, "prctr_txt");
            var sFkber = this._readField(oMapped, "fkber");
            var sFkbtx = this._readField(oMapped, "fkbtx");
            var sFkberText = this._readField(oMapped, "fkber_txt");
            var sFkberDisplayText = sFkbtx || sFkberText;

            oMapped.segment = sSegment;
            oMapped.segment_txt = sSegmentText;
            oMapped.prctr = sPrctr;
            oMapped.prctr_txt = sPrctrText;
            oMapped.fkber = sFkber;
            oMapped.fkbtx = sFkbtx;
            oMapped.fkber_txt = sFkberText;
            oMapped.fkberTextDisplay = sFkberDisplayText;
            oMapped.segmentDisplay = this._formatTextOnly(sSegmentText);
            oMapped.prctrDisplay = this._formatTextOnly(sPrctrText);
            oMapped.fkberDisplay = this._formatTextOnly(sFkberDisplayText);

            return oMapped;
        },

        _formatProductKey: function (oRow) {
            return [this._readField(oRow, "matnr"), this._readField(oRow, "mtopt")].filter(Boolean).join(" / ") || "-";
        },

        _formatOptionText: function (sOptionCode, sOptionText) {
            var sCleanText = this._cleanText(sOptionText);

            if (sCleanText) {
                return sCleanText;
            }

            return "-";
        },

        _formatTextOnly: function (sText) {
            var sCleanText = this._cleanText(sText);

            return sCleanText || "-";
        },

        _fillMissingText: function (oTarget, oSource, aProperties) {
            aProperties.forEach(function (sProperty) {
                if (!oTarget[sProperty] && oSource[sProperty]) {
                    oTarget[sProperty] = oSource[sProperty];
                }
            });
        },

        _readField: function (oRow, sFieldName) {
            var sTargetFieldName;
            var sMatchedKey;

            if (!oRow) {
                return "";
            }
            if (oRow[sFieldName] !== undefined && oRow[sFieldName] !== null) {
                return oRow[sFieldName];
            }

            sTargetFieldName = String(sFieldName || "").toLowerCase();
            sMatchedKey = Object.keys(oRow).find(function (sKey) {
                return sKey.toLowerCase() === sTargetFieldName;
            });

            return sMatchedKey && oRow[sMatchedKey] !== null ? oRow[sMatchedKey] : "";
        },

        _accountRoleInfo: function (vAccount) {
            var sAccount = this._cleanText(vAccount).toUpperCase();
            var iAccount = Number(sAccount);
            var mRoles = {
                "800015": { key: "MATERIAL", text: "재료비", detail: "최종 제조원가 반영", finalManufacturing: true },
                "800016": { key: "MANUFACTURING_RECEIPT", text: "제조입고", detail: "최종 제조원가 차감", finalManufacturing: true },
                "800020": { key: "STANDARD_PROCESSING", text: "표준/귀속 가공비", detail: "노무비배부", finalManufacturing: true },
                "800021": { key: "STANDARD_PROCESSING", text: "표준/귀속 가공비", detail: "기계경비배부", finalManufacturing: true },
                "800022": { key: "STANDARD_PROCESSING", text: "표준/귀속 가공비", detail: "간접비배부", finalManufacturing: true },
                "800023": { key: "PRICE_VARIANCE", text: "가격차이", detail: "가격차이 영역 전용", finalManufacturing: false },
                "800024": { key: "ALLOCATION_VARIANCE", text: "배부차이", detail: "실제 분할원가와 표준/귀속 가공비 차이", finalManufacturing: true }
            };

            if (mRoles[sAccount]) {
                return Object.assign({
                    sourceActual: false
                }, mRoles[sAccount]);
            }

            if (/^4/.test(sAccount)) {
                return {
                    key: "REVENUE",
                    text: "매출",
                    detail: "수익/매출 전표",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            if (/^6/.test(sAccount)) {
                return {
                    key: "COGS",
                    text: "매출원가",
                    detail: "매출원가 전표",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            if (/^7/.test(sAccount)) {
                return {
                    key: "SGA",
                    text: "판관비",
                    detail: "판매관리비 전표",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
                return {
                    key: sAccount === "800008" ? "SOURCE_ACTUAL_EXCLUDED" : "SOURCE_ACTUAL",
                    text: sAccount === "800008" ? "원천 실제비용(분할 제외)" : "원천 실제비용",
                    detail: sAccount === "800008" ? "현재 데이터 기준 배부/분할 제외" : "활동단가/배부차이 산출 원천",
                    finalManufacturing: false,
                    sourceActual: true
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800019) {
                return {
                    key: "PRODUCTION_ABSORPTION",
                    text: "생산실적 차감/흡수",
                    detail: "일반 배부 원천/수신 제외",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            return {
                key: "OTHER",
                text: "기타",
                detail: "",
                finalManufacturing: false,
                sourceActual: false
            };
        },

        _accountProcessStepInfo: function (vAccount, oRow, oRole) {
            var sAccount = this._cleanText(vAccount).toUpperCase();
            var iAccount = Number(sAccount);
            var bFinalRelevant = !!(oRole && oRole.finalManufacturing);
            var bAllocation = this._isAllocationJournalRow(oRow);
            var bSplit = this._isSplitJournalRow(oRow);

            if (/^4/.test(sAccount)) {
                return {
                    key: "REVENUE_POSTING",
                    text: "수익전표",
                    detail: "매출/수익 인식",
                    finalManufacturingRelevant: false
                };
            }

            if (/^6/.test(sAccount)) {
                return {
                    key: "COGS_POSTING",
                    text: "매출원가",
                    detail: "매출원가 인식",
                    finalManufacturingRelevant: false
                };
            }

            if (/^7/.test(sAccount)) {
                return {
                    key: "SGA_POSTING",
                    text: "판관비",
                    detail: "판매관리비 인식",
                    finalManufacturingRelevant: false
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
                if (bSplit && sAccount !== "800008") {
                    return {
                        key: "ACTIVITY_SPLIT",
                        text: "활동유형 분할",
                        detail: "800001~800014 중 800008 제외 원천비용 분할",
                        finalManufacturingRelevant: false
                    };
                }

                if (bAllocation) {
                    return {
                        key: "INTER_DEPT_ALLOCATION",
                        text: "부서 간 배부",
                        detail: "원천 비용 성격을 유지한 책임부서 이동",
                        finalManufacturingRelevant: false
                    };
                }

                return {
                    key: sAccount === "800008" ? "SOURCE_COST_EXCLUDED" : "SOURCE_COST",
                    text: "원천 비용 발생",
                    detail: sAccount === "800008" ? "분할/배부 대상 제외 원천비용" : "실제 제조비용 Pool",
                    finalManufacturingRelevant: false
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800022) {
                return {
                    key: "PRODUCTION_ATTRIBUTION",
                    text: "생산실적 귀속",
                    detail: iAccount >= 800020 ? "표준/생산실적 가공비 귀속" : "생산실적 차감/흡수",
                    finalManufacturingRelevant: bFinalRelevant
                };
            }

            if (sAccount === "800023") {
                return {
                    key: "PRICE_VARIANCE",
                    text: "가격차이",
                    detail: "가격차이 포함/별도 기준 확인 대상",
                    finalManufacturingRelevant: false
                };
            }

            if (sAccount === "800024") {
                return {
                    key: "ALLOCATION_VARIANCE",
                    text: "배부차이",
                    detail: "실제 분할원가와 표준/귀속 가공비 차이",
                    finalManufacturingRelevant: true
                };
            }

            if (sAccount === "800015" || sAccount === "800016") {
                return {
                    key: "FINAL_MFG_COST",
                    text: "최종 제조원가 반영",
                    detail: sAccount === "800016" ? "제조입고 차감" : "원재료비 반영",
                    finalManufacturingRelevant: true
                };
            }

            if (bAllocation) {
                return {
                    key: "INTER_DEPT_ALLOCATION",
                    text: "부서 간 배부",
                    detail: "비용 책임부서 이동",
                    finalManufacturingRelevant: false
                };
            }

            return {
                key: "OTHER",
                text: "기타",
                detail: "",
                finalManufacturingRelevant: bFinalRelevant
            };
        },

        _isAllocationJournalRow: function (oRow) {
            var sText = [
                this._readField(oRow, "cost_flow_type"),
                this._readField(oRow, "cost_flow_type_txt"),
                this._readField(oRow, "blart"),
                this._readField(oRow, "blart_txt"),
                this._readField(oRow, "sgtxt")
            ].map(this._cleanText, this).join(" ");

            return sText.toUpperCase().indexOf("ALLOC") > -1 || sText.indexOf("배부") > -1;
        },

        _isSplitJournalRow: function (oRow) {
            var sBlart = this._cleanText(this._readField(oRow, "blart")).toUpperCase();
            var sText = [
                this._readField(oRow, "cost_flow_type"),
                this._readField(oRow, "cost_flow_type_txt"),
                this._readField(oRow, "blart_txt"),
                this._readField(oRow, "sgtxt")
            ].map(this._cleanText, this).join(" ");

            return sText.toUpperCase().indexOf("SPLIT") > -1 || sText.indexOf("분할") > -1 || sBlart === "ZA";
        },

        _cleanText: function (vValue) {
            return vValue === null || vValue === undefined ? "" : String(vValue).trim();
        },

        _sum: function (aRows, sProperty) {
            var bHasNumber = false;
            var fSum = aRows.reduce(function (fTotal, oRow) {
                if (!this._isFiniteNumber(oRow[sProperty])) {
                    return fTotal;
                }
                bHasNumber = true;
                return fTotal + oRow[sProperty];
            }.bind(this), 0);

            return bHasNumber ? fSum : null;
        },

        _firstNumber: function (aRows, sProperty) {
            var oRow = aRows.filter(function (oCandidate) {
                return this._isFiniteNumber(oCandidate[sProperty]);
            }.bind(this))[0];

            return oRow ? oRow[sProperty] : null;
        },

        _firstText: function (aRows, sProperty) {
            var oRow = aRows.filter(function (oCandidate) {
                return oCandidate[sProperty];
            })[0];

            return oRow ? oRow[sProperty] : "";
        },

        _addNullable: function (vCurrent, vAdd) {
            if (!this._isFiniteNumber(vAdd)) {
                return vCurrent;
            }
            return (this._isFiniteNumber(vCurrent) ? vCurrent : 0) + vAdd;
        },

        _toNumber: function (vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return null;
            }

            var fValue = Number(vValue);
            return isFinite(fValue) ? fValue : null;
        },

        _isFiniteNumber: function (vValue) {
            return vValue !== null && vValue !== undefined && isFinite(Number(vValue));
        },

        _sortNumber: function (vValue) {
            return this._isFiniteNumber(vValue) ? Number(vValue) : Number.NEGATIVE_INFINITY;
        },

        _connectChartPopovers: function () {
            if (!this.byId) {
                return;
            }

            [
                "cockpitMonthlyChart",
                "cockpitShareChart",
                "cockpitStructureChart",
                "productProfitChart",
                "productMarginChart",
                "actualPlanMonthlyChart",
                "actualPlanProfitCenterChart",
                "actualPlanVarianceChart"
            ].forEach(function (sId) {
                var oChart = this.byId(sId);
                var sVizUid = oChart && oChart.getVizUid && oChart.getVizUid();

                if (!sVizUid) {
                    return;
                }

                this._mChartPopovers = this._mChartPopovers || {};
                if (!this._mChartPopovers[sId]) {
                    this._mChartPopovers[sId] = new VizPopover({});
                    this.getView().addDependent(this._mChartPopovers[sId]);
                }
                this._mChartPopovers[sId].connect(sVizUid);
            }.bind(this));
        },

        _applyChartProperties: function () {
            var aChartIds = [
                "cockpitMonthlyChart",
                "cockpitShareChart",
                "cockpitStructureChart",
                "productProfitChart",
                "productMarginChart",
                "actualPlanMonthlyChart",
                "actualPlanProfitCenterChart",
                "actualPlanVarianceChart"
            ];
            var mProperties = {
                title: {
                    visible: false
                },
                legend: {
                    visible: true
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        hideWhenOverlap: true,
                        style: {
                            color: "#22304a",
                            fontWeight: "bold"
                        }
                    },
                    drawingEffect: "glossy",
                    colorPalette: ["#0A6ED1", "#6F42C1", "#107E3E", "#E9730C", "#BB0000", "#008080", "#925ACE", "#0F828F"]
                },
                categoryAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        style: {
                            color: "#4f6278"
                        }
                    }
                },
                valueAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        style: {
                            color: "#4f6278"
                        }
                    }
                }
            };

            aChartIds.forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mProperties);
                }
            }.bind(this));

            this._applySpecificChartProperties();
        },

        _applySpecificChartProperties: function () {
            var mByChart = {
                cockpitShareChart: {
                    plotArea: {
                        dataLabel: {
                            visible: true,
                            type: "percentage"
                        }
                    },
                    legend: {
                        position: "bottom"
                    }
                },
                cockpitMonthlyChart: {
                    plotArea: {
                        colorPalette: ["#2F80ED", "#C8792A", "#2E8B57", "#C45A4A", "#008A83"]
                    }
                },
                cockpitStructureChart: {
                    interaction: {
                        zoom: {
                            enablement: "disabled"
                        }
                    },
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#2F80ED", "#C8792A", "#2E8B57", "#C45A4A", "#008A83"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    categoryAxis: {
                        label: {
                            visible: false
                        },
                        title: {
                            visible: false
                        }
                    }
                },
                productProfitChart: {
                    plotArea: {
                        colorPalette: ["#008A83"],
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                },
                productMarginChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#2E8B57", "#8054C7"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    }
                },
                actualPlanMonthlyChart: {
                    plotArea: {
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                },
                actualPlanProfitCenterChart: {
                    plotArea: {
                        colorPalette: ["#008A83"],
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                },
                actualPlanVarianceChart: {
                    plotArea: {
                        colorPalette: ["#2F80ED", "#2E8B57", "#C45A4A", "#8054C7", "#C8792A"],
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                }
            };

            Object.keys(mByChart).forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mByChart[sId]);
                }
            }.bind(this));
        }
    });
});
