sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/ui/export/Spreadsheet",
    "sap/m/MessageBox"
], (Controller, JSONModel, Filter, FilterOperator, History, Spreadsheet, MessageBox) => {
    "use strict";

    return Controller.extend("ze4.co.s.cost.ze4coscost.controller.StandardCost", {
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteStandardCost").attachPatternMatched(this._onRouteMatched, this);
            
            // Initialize local model with default filter values
            const oModel = new JSONModel({
                filters: {
                    gjahr: new Date().getFullYear(),
                    monat: String(new Date().getMonth() + 1).padStart(2, '0'),
                    matnr: "",
                    kostl: "",
                    mtart: "",
                    matkl: ""
                },
                costData: []
            });
            this.getView().setModel(oModel, "view");
            
            // Load initial data
            this._loadCostData();
        },

        _onRouteMatched() {
            this._loadCostData();
        },

        _loadCostData() {
            const oModel = this.getOwnerComponent().getModel();
            const oViewModel = this.getView().getModel("view");
            const filters = oViewModel.getProperty("/filters");

            const sYear = String(filters.gjahr || "").trim();
            const sMonth = String(filters.monat || "").trim().padStart(2, "0");

            if (!/^\d{4}$/.test(sYear)) {
                MessageBox.warning("연도는 4자리 숫자로 입력해주세요.");
                return;
            }

            if (!/^(0[1-9]|1[0-2])$/.test(sMonth)) {
                MessageBox.warning("월은 01부터 12까지 입력해주세요.");
                return;
            }

            oViewModel.setProperty("/filters/gjahr", sYear);
            oViewModel.setProperty("/filters/monat", sMonth);

            const aFilters = [
                new Filter("gjahr", FilterOperator.EQ, sYear),
                new Filter("monat", FilterOperator.EQ, sMonth)
            ];

            if (filters.matnr && String(filters.matnr).trim()) {
                aFilters.push(new Filter("matnr", FilterOperator.Contains, String(filters.matnr).trim().toUpperCase()));
            }
            if (filters.kostl && String(filters.kostl).trim()) {
                aFilters.push(new Filter("kostl", FilterOperator.Contains, String(filters.kostl).trim().toUpperCase()));
            }
            if (filters.mtart && String(filters.mtart).trim()) {
                aFilters.push(new Filter("mtart", FilterOperator.Contains, String(filters.mtart).trim().toUpperCase()));
            }
            if (filters.matkl && String(filters.matkl).trim()) {
                aFilters.push(new Filter("matkl", FilterOperator.Contains, String(filters.matkl).trim().toUpperCase()));
            }

            oModel.read("/zcds_e4_co_0010", {
                filters: aFilters,
                success: (oData) => {
                    oViewModel.setProperty("/costData", oData.results || []);
                },
                error: (oError) => {
                    MessageBox.error("데이터 조회 실패");
                    console.error("Data load error:", oError);
                }
            });
        },

        onSearch() {
            this._loadCostData();
        },

        onResetFilters() {
            const oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/filters", {
                gjahr: new Date().getFullYear(),
                monat: String(new Date().getMonth() + 1).padStart(2, '0'),
                matnr: "",
                kostl: "",
                mtart: "",
                matkl: ""
            });
            this._loadCostData();
        },

        onRowSelectionChange(oEvent) {
            const oTable = this.byId("costSummaryTable");
            const iIndex = oEvent.getParameter("rowIndex");
            
            if (iIndex >= 0) {
                const oContext = oTable.getContextByIndex(iIndex);
                if (!oContext) {
                    return;
                }

                const oData = oContext.getObject();
                const oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("RouteStandardCostDetail", {
                    matnr: encodeURIComponent(oData.matnr),
                    gjahr: encodeURIComponent(oData.gjahr),
                    monat: encodeURIComponent(oData.monat),
                    kostl: encodeURIComponent(oData.kostl)
                });
            }
        },

        onExportToExcel() {
            const aData = this.getView().getModel("view").getProperty("/costData");
            
            if (!aData || aData.length === 0) {
                MessageBox.warning("내보낼 데이터가 없습니다.");
                return;
            }

            const aCols = [
                { label: "자재번호", property: "matnr" },
                { label: "자재명", property: "maktx" },
                { label: "연도", property: "gjahr" },
                { label: "월", property: "monat" },
                { label: "코스트센터", property: "kostl" },
                { label: "코스트센터명", property: "ktext" },
                { label: "총 표준원가", property: "total_cost" },
                { label: "통화", property: "waers" },
                { label: "가용재고", property: "total_clabs" },
                { label: "검수대기", property: "total_verme" },
                { label: "보류재고", property: "total_cspem" },
                { label: "배치예약", property: "total_resme" },
                { label: "단위", property: "meins" }
            ];

            const oSettings = {
                workbook: {
                    columns: aCols
                },
                dataSource: aData,
                fileName: "StandardCostReport_" + new Date().toISOString().slice(0, 10) + ".xlsx"
            };

            const oSheet = new Spreadsheet(oSettings);
            oSheet.build().then(() => {
                MessageBox.success("Excel 파일이 다운로드되었습니다.");
            }).catch((oError) => {
                MessageBox.error("Excel 내보내기 실패");
            });
        },

        onExportToPdf() {
            const aPrintMarkup = [];
            const aData = this.getView().getModel("view").getProperty("/costData") || [];

            if (aData.length === 0) {
                MessageBox.warning("출력할 데이터가 없습니다.");
                return;
            }
            
            aPrintMarkup.push("<!DOCTYPE html>");
            aPrintMarkup.push("<html>");
            aPrintMarkup.push("<head>");
            aPrintMarkup.push("<meta charset='UTF-8'/>");
            aPrintMarkup.push("<title>표준원가 리포트</title>");
            aPrintMarkup.push("<style>");
            aPrintMarkup.push("body { font-family: Arial, sans-serif; margin: 20px; }");
            aPrintMarkup.push("table { border-collapse: collapse; width: 100%; margin-top: 20px; }");
            aPrintMarkup.push("th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }");
            aPrintMarkup.push("th { background-color: #f2f2f2; font-weight: bold; }");
            aPrintMarkup.push("h1 { color: #333; }");
            aPrintMarkup.push("</style>");
            aPrintMarkup.push("</head>");
            aPrintMarkup.push("<body>");
            aPrintMarkup.push("<h1>[EverNiture-CO] 표준원가 기간별 요약 및 재고 링크</h1>");
            aPrintMarkup.push("<p>생성일시: " + new Date().toLocaleString('ko-KR') + "</p>");

            aPrintMarkup.push("<table>");
            aPrintMarkup.push("<thead><tr>");
            aPrintMarkup.push("<th>자재번호</th><th>자재명</th><th>연도</th><th>월</th><th>코스트센터</th>");
            aPrintMarkup.push("<th>코스트센터명</th><th>총 표준원가</th><th>가용재고</th><th>검수대기</th>");
            aPrintMarkup.push("<th>보류재고</th><th>배치예약</th><th>단위</th>");
            aPrintMarkup.push("</tr></thead>");
            aPrintMarkup.push("<tbody>");

            aData.forEach((oItem) => {
                aPrintMarkup.push("<tr>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.matnr) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.maktx) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.gjahr) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.monat) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.kostl) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.ktext) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(this.formatAmount(oItem.total_cost)) + " " + this._escapeHtml(oItem.waers) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(this.formatQuantity(oItem.total_clabs)) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(this.formatQuantity(oItem.total_verme)) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(this.formatQuantity(oItem.total_cspem)) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(this.formatQuantity(oItem.total_resme)) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.meins) + "</td>");
                aPrintMarkup.push("</tr>");
            });

            aPrintMarkup.push("</tbody></table>");
            aPrintMarkup.push("</body></html>");

            const sHtml = aPrintMarkup.join("");
            const oWindow = window.open("", "", "width=800,height=600");
            if (!oWindow) {
                MessageBox.warning("팝업 차단을 해제한 뒤 다시 시도해주세요.");
                return;
            }
            oWindow.document.write(sHtml);
            oWindow.document.close();
            oWindow.print();
        },

        formatAmount(vValue) {
            return this._formatNumber(vValue, 0);
        },

        formatQuantity(vValue) {
            return this._formatNumber(vValue, 3);
        },

        formatResultCount(aRows) {
            const iCount = Array.isArray(aRows) ? aRows.length : 0;
            return `${iCount}건`;
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

        _escapeHtml(vValue) {
            return String(vValue ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
    });
});
