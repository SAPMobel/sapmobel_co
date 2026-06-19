sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "ze4/co/pa/ze4copa/model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, formatter) {
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
            this._oViewModel.setProperty("/selectedProductTitle", this._formatProductKey(oRow));
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", "");

            if (oDialog) {
                oDialog.open();
            }

            this._loadJournalData(oRow);
        },

        onCloseDrilldown: function () {
            var oDialog = this.byId("drilldownDialog");
            if (oDialog) {
                oDialog.close();
            }
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
                productShareChart: [],
                structureChart: [],
                marginChart: [],
                actualPlanRows: [],
                actualPlanMonthlyChart: [],
                accountVarianceChart: [],
                drilldownRows: [],
                selectedProductTitle: "",
                productMessage: "",
                actualPlanMessage: "",
                drilldownMessage: "",
                hasProductData: false,
                hasActualPlanData: false,
                hasPlanData: false
            };
        },

        _getDefaultFilterValues: function () {
            var oNow = new Date();
            var sYear = String(oNow.getFullYear());
            var sMonth = String(oNow.getMonth() + 1).padStart(2, "0");

            return {
                controllingArea: "0001",
                companyCode: "0001",
                fiscalYear: sYear,
                month: sMonth,
                planVersion: "000",
                matnr: "",
                mtopt: "",
                waers: "",
                segment: "",
                prctr: "",
                pcg: "",
                fkber: "",
                acctGroup: ""
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
                productCount: null,
                allocatedSga: null,
                operatingProfit: null,
                operatingProfitRate: null,
                grossProfitRate: null,
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

            this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to", "p_versn"], {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month,
                p_versn: oFilters.planVersion
            }, aODataFilters).then(function (aRows) {
                this._applyActualPlanData(aRows);
            }.bind(this)).catch(function (oError) {
                var sMessage = this._formatODataError(oError, "실적/계획 비교 데이터를 조회하지 못했습니다.");
                if (!bSummaryOnly) {
                    this._setActualPlanError(sMessage);
                } else {
                    this._oViewModel.setProperty("/actualPlanMessage", sMessage);
                }
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/actualPlanBusy", false);
            }.bind(this));
        },

        _loadJournalData: function (oProductRow) {
            var oModel = this._getOwnerModel("journal");
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = [];

            if (!oModel) {
                this._setDrilldownError("전표 Drill-Down OData 모델을 찾을 수 없습니다.");
                return;
            }

            if (oProductRow.matnr) {
                aODataFilters.push(new Filter("matnr", FilterOperator.EQ, oProductRow.matnr));
            }
            if (oProductRow.mtopt) {
                aODataFilters.push(new Filter("mtopt", FilterOperator.EQ, oProductRow.mtopt));
            }

            this._oViewModel.setProperty("/drilldownBusy", true);

            this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"], {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            }, aODataFilters).then(function (aRows) {
                this._oViewModel.setProperty("/drilldownRows", aRows || []);
                this._oViewModel.setProperty("/drilldownMessage", aRows && aRows.length ? "" : "선택한 제품/옵션에 해당하는 전표 라인이 없습니다.");
            }.bind(this)).catch(function (oError) {
                this._setDrilldownError(this._formatODataError(oError, "전표 Drill-Down 데이터를 조회하지 못했습니다."));
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
            if (oFilters.waers) {
                aFilters.push(new Filter("waers", FilterOperator.EQ, oFilters.waers));
            }

            return aFilters;
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
            if (oFilters.pcg) {
                aFilters.push(new Filter("pcg", FilterOperator.EQ, oFilters.pcg));
            }
            if (oFilters.fkber) {
                aFilters.push(new Filter("fkber", FilterOperator.EQ, oFilters.fkber));
            }
            if (oFilters.acctGroup) {
                aFilters.push(new Filter("acct_group", FilterOperator.EQ, oFilters.acctGroup));
            }

            return aFilters;
        },

        _readParameterizedSet: function (oModel, aParameterNames, mParameters, aFilters) {
            return this._resolveParameterizedEndpoint(oModel, aParameterNames).then(function (oEndpoint) {
                return new Promise(function (resolve, reject) {
                    var sKeyPredicate = aParameterNames.map(function (sName) {
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

        _resolveParameterizedEndpoint: function (oModel, aParameterNames) {
            var sCacheKey = (oModel.sServiceUrl || "") + "::" + aParameterNames.join("|");

            if (this._mEndpointCache[sCacheKey]) {
                return Promise.resolve(this._mEndpointCache[sCacheKey]);
            }

            return oModel.metadataLoaded().then(function () {
                var oEndpoint = this._findParameterizedEndpoint(oModel.getServiceMetadata(), aParameterNames);

                if (!oEndpoint) {
                    throw new Error("Parameterized CDS metadata 구조를 찾을 수 없습니다.");
                }

                this._mEndpointCache[sCacheKey] = oEndpoint;
                return oEndpoint;
            }.bind(this));
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
                    navigationProperty: this._findResultNavigation(oEntityType)
                };
            }

            return null;
        },

        _findParameterEntityType: function (oSchema, aParameterNames) {
            var aEntityTypes = this._asArray(oSchema.entityType);
            var aCandidates = aEntityTypes.filter(function (oEntityType) {
                return this._entityHasProperties(oEntityType, aParameterNames) &&
                    this._asArray(oEntityType.navigationProperty).length > 0;
            }.bind(this));

            return aCandidates.filter(function (oEntityType) {
                return /Parameters$/i.test(oEntityType.name || "");
            })[0] || aCandidates[0];
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
            var aProperties = this._asArray(oEntityType.property).map(function (oProperty) {
                return oProperty.name;
            });

            return aPropertyNames.every(function (sName) {
                return aProperties.indexOf(sName) > -1;
            });
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
                var oMapped = Object.assign({}, oRow);

                oMapped.sales = this._toNumber(oRow.sales_amt);
                oMapped.cogs = this._toNumber(oRow.cogs_amt);
                oMapped.grossProfit = this._toNumber(oRow.gross_profit_amt);
                oMapped.grossProfitRate = this._toNumber(oRow.gross_profit_rate);
                oMapped.variance = this._toNumber(oRow.variance_amt);
                oMapped.sgaPool = this._toNumber(oRow.sga_pool_amt);
                oMapped.productCount = this._toNumber(oRow.product_count);
                oMapped.allocatedSga = this._toNumber(oRow.allocated_sga_amt);
                oMapped.operatingProfit = this._toNumber(oRow.operating_profit_amt);
                oMapped.operatingProfitRate = this._toNumber(oRow.operating_profit_rate);
                oMapped.productKey = this._formatProductKey(oMapped);
                oMapped.profitState = formatter.stateByAmount(oMapped.operatingProfit);
                oMapped.rateState = formatter.stateByRate(oMapped.operatingProfitRate);

                return oMapped;
            }.bind(this));

            var oKpi = this._calculateProductKpi(aProductRows);
            var aTopRows = aProductRows.slice().sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.operatingProfit) - this._sortNumber(oLeft.operatingProfit);
            }.bind(this)).slice(0, 10);

            this._oViewModel.setProperty("/productRows", aProductRows);
            this._oViewModel.setProperty("/topRows", aTopRows);
            this._oViewModel.setProperty("/kpi", oKpi);
            this._oViewModel.setProperty("/monthlyChart", this._buildMonthlyChart(oKpi));
            this._oViewModel.setProperty("/productShareChart", this._buildProductShareChart(aProductRows));
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
            oKpi.productCount = this._firstNumber(aRows, "productCount");
            oKpi.allocatedSga = this._firstNumber(aRows, "allocatedSga");
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
                sales: oKpi.sales,
                cogs: oKpi.cogs,
                grossProfit: oKpi.grossProfit,
                operatingProfit: oKpi.operatingProfit
            }];
        },

        _buildProductShareChart: function (aRows) {
            return aRows.filter(function (oRow) {
                return this._isFiniteNumber(oRow.sales) && oRow.sales !== 0;
            }.bind(this)).sort(function (oLeft, oRight) {
                return Math.abs(oRight.sales) - Math.abs(oLeft.sales);
            }).slice(0, 8).map(function (oRow) {
                return {
                    productKey: oRow.productKey,
                    sales: oRow.sales
                };
            });
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
                amount: this._isFiniteNumber(oKpi.sgaPool) ? -Math.abs(oKpi.sgaPool) : null
            }, {
                item: "영업이익",
                amount: oKpi.operatingProfit
            }];
        },

        _buildMarginChart: function (aRows) {
            return aRows.filter(function (oRow) {
                return this._isFiniteNumber(oRow.grossProfitRate) || this._isFiniteNumber(oRow.operatingProfitRate);
            }.bind(this)).slice(0, 12).map(function (oRow) {
                return {
                    productKey: oRow.productKey,
                    grossProfitRate: this._isFiniteNumber(oRow.grossProfitRate) ? oRow.grossProfitRate * 100 : null,
                    operatingProfitRate: this._isFiniteNumber(oRow.operatingProfitRate) ? oRow.operatingProfitRate * 100 : null
                };
            }.bind(this));
        },

        _applyActualPlanData: function (aRows) {
            var aSourceRows = (aRows || []).map(function (oRow) {
                return Object.assign({}, oRow, {
                    amountNumber: this._toNumber(oRow.amount),
                    rowKey: [
                        oRow.monat,
                        oRow.segment,
                        oRow.prctr,
                        oRow.pcg,
                        oRow.fkber,
                        oRow.acct_group
                    ].join("|")
                });
            }.bind(this));
            var aPlanRows = aSourceRows.filter(function (oRow) {
                return oRow.value_type === "PLAN";
            });
            var aPivotRows = this._pivotActualPlanRows(aSourceRows);
            var oKpi = this._calculateActualPlanKpi(aSourceRows, aPlanRows.length > 0);

            this._oViewModel.setProperty("/actualPlanRows", aPivotRows);
            this._oViewModel.setProperty("/actualPlanKpi", oKpi);
            this._oViewModel.setProperty("/actualPlanMonthlyChart", this._buildActualPlanMonthlyChart(aSourceRows));
            this._oViewModel.setProperty("/accountVarianceChart", this._buildAccountVarianceChart(aPivotRows));
            this._oViewModel.setProperty("/hasActualPlanData", aSourceRows.length > 0);
            this._oViewModel.setProperty("/hasPlanData", aPlanRows.length > 0);
            this._oViewModel.setProperty("/actualPlanMessage", aSourceRows.length ? "" : "조회 조건에 해당하는 실적/계획 데이터가 없습니다.");
        },

        _pivotActualPlanRows: function (aRows) {
            var mPivot = {};

            aRows.forEach(function (oRow) {
                var sKey = [
                    oRow.monat || "",
                    oRow.segment || "",
                    oRow.prctr || "",
                    oRow.pcg || "",
                    oRow.fkber || "",
                    oRow.fkber_txt || "",
                    oRow.acct_group || "",
                    oRow.acct_group_txt || "",
                    oRow.waers || ""
                ].join("|");

                if (!mPivot[sKey]) {
                    mPivot[sKey] = {
                        monat: oRow.monat,
                        segment: oRow.segment,
                        prctr: oRow.prctr,
                        pcg: oRow.pcg,
                        fkber: oRow.fkber,
                        fkber_txt: oRow.fkber_txt,
                        acct_group: oRow.acct_group,
                        acct_group_txt: oRow.acct_group_txt,
                        waers: oRow.waers,
                        actual: null,
                        plan: null,
                        diff: null,
                        achievementRate: null
                    };
                }

                if (oRow.value_type === "ACTUAL") {
                    mPivot[sKey].actual = this._addNullable(mPivot[sKey].actual, oRow.amountNumber);
                } else if (oRow.value_type === "PLAN") {
                    mPivot[sKey].plan = this._addNullable(mPivot[sKey].plan, oRow.amountNumber);
                }
            }.bind(this));

            return Object.keys(mPivot).map(function (sKey) {
                var oRow = mPivot[sKey];

                if (this._isFiniteNumber(oRow.actual) && this._isFiniteNumber(oRow.plan)) {
                    oRow.diff = oRow.actual - oRow.plan;
                    if (oRow.plan !== 0) {
                        oRow.achievementRate = oRow.actual / oRow.plan;
                    }
                }

                oRow.diffState = formatter.stateByAmount(oRow.diff);
                return oRow;
            }.bind(this)).sort(function (oLeft, oRight) {
                return String(oLeft.monat || "").localeCompare(String(oRight.monat || "")) ||
                    String(oLeft.acct_group || "").localeCompare(String(oRight.acct_group || ""));
            });
        },

        _calculateActualPlanKpi: function (aRows, bHasPlanRows) {
            var oKpi = this._emptyActualPlanKpi();

            oKpi.salesActual = this._sumFilteredActualPlan(aRows, "ACTUAL", "REV");
            oKpi.salesPlan = bHasPlanRows ? this._sumFilteredActualPlan(aRows, "PLAN", "REV") : null;
            oKpi.operatingProfitActual = this._sumFilteredActualPlan(aRows, "ACTUAL");
            oKpi.operatingProfitPlan = bHasPlanRows ? this._sumFilteredActualPlan(aRows, "PLAN") : null;
            oKpi.currency = this._firstText(aRows, "waers");

            if (this._isFiniteNumber(oKpi.salesActual) && this._isFiniteNumber(oKpi.salesPlan)) {
                oKpi.salesDiff = oKpi.salesActual - oKpi.salesPlan;
            }
            if (this._isFiniteNumber(oKpi.operatingProfitActual) && this._isFiniteNumber(oKpi.operatingProfitPlan)) {
                oKpi.operatingProfitDiff = oKpi.operatingProfitActual - oKpi.operatingProfitPlan;
            }
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

                if (oRow.value_type === "ACTUAL") {
                    mByMonth[sMonth].actual = this._addNullable(mByMonth[sMonth].actual, oRow.amountNumber);
                } else if (oRow.value_type === "PLAN") {
                    mByMonth[sMonth].plan = this._addNullable(mByMonth[sMonth].plan, oRow.amountNumber);
                }
            }.bind(this));

            return Object.keys(mByMonth).sort().map(function (sMonth) {
                return mByMonth[sMonth];
            });
        },

        _buildAccountVarianceChart: function (aRows) {
            var mByAccount = {};

            aRows.forEach(function (oRow) {
                var sKey = oRow.acct_group_txt || oRow.acct_group || "-";

                if (!this._isFiniteNumber(oRow.diff)) {
                    return;
                }

                mByAccount[sKey] = this._addNullable(mByAccount[sKey], oRow.diff);
            }.bind(this));

            return Object.keys(mByAccount).map(function (sKey) {
                return {
                    accountGroup: sKey,
                    diff: mByAccount[sKey]
                };
            });
        },

        _sumFilteredActualPlan: function (aRows, sValueType, sAccountGroup) {
            var aFilteredRows = aRows.filter(function (oRow) {
                return oRow.value_type === sValueType && (!sAccountGroup || oRow.acct_group === sAccountGroup);
            });

            if (!aFilteredRows.length) {
                return null;
            }

            return aFilteredRows.reduce(function (fSum, oRow) {
                return fSum + (this._isFiniteNumber(oRow.amountNumber) ? oRow.amountNumber : 0);
            }.bind(this), 0);
        },

        _setProductError: function (sMessage) {
            this._oViewModel.setProperty("/productRows", []);
            this._oViewModel.setProperty("/topRows", []);
            this._oViewModel.setProperty("/monthlyChart", []);
            this._oViewModel.setProperty("/productShareChart", []);
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
            this._oViewModel.setProperty("/accountVarianceChart", []);
            this._oViewModel.setProperty("/actualPlanKpi", this._emptyActualPlanKpi());
            this._oViewModel.setProperty("/hasActualPlanData", false);
            this._oViewModel.setProperty("/hasPlanData", false);
            this._oViewModel.setProperty("/actualPlanMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _setDrilldownError: function (sMessage) {
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _formatODataError: function (oError, sFallbackMessage) {
            var sMessage = sFallbackMessage;
            var oPayload;

            try {
                oPayload = oError && oError.responseText ? JSON.parse(oError.responseText) : null;
                sMessage = oPayload && oPayload.error && oPayload.error.message &&
                    (oPayload.error.message.value || oPayload.error.message) || sMessage;
            } catch (e) {
                sMessage = oError && oError.message || sMessage;
            }

            return sMessage;
        },

        _formatProductKey: function (oRow) {
            return [oRow.matnr, oRow.mtopt].filter(Boolean).join(" / ") || "-";
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

        _applyChartProperties: function () {
            var aChartIds = [
                "cockpitMonthlyChart",
                "cockpitShareChart",
                "cockpitStructureChart",
                "productProfitChart",
                "productMarginChart",
                "actualPlanMonthlyChart",
                "accountVarianceChart"
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
                        visible: false
                    },
                    colorPalette: ["#0A6ED1", "#6F42C1", "#107E3E", "#E9730C", "#BB0000", "#6A6D70"]
                },
                categoryAxis: {
                    title: {
                        visible: false
                    }
                },
                valueAxis: {
                    title: {
                        visible: false
                    }
                }
            };

            aChartIds.forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mProperties);
                }
            }.bind(this));
        }
    });
});
