sap.ui.define([
    "sap/ui/core/library",
    "sap/ui/core/format/NumberFormat",
    "sap/ui/core/format/DateFormat"
], function (coreLibrary, NumberFormat, DateFormat) {
    "use strict";

    var ValueState = coreLibrary.ValueState;

    function isEmpty(vValue) {
        return vValue === null || vValue === undefined || vValue === "";
    }

    function toNumber(vValue) {
        if (isEmpty(vValue)) {
            return null;
        }

        var fValue = Number(vValue);
        return Number.isFinite(fValue) ? fValue : null;
    }

    var oResourceBundle;

    function getBundle(oContext) {
        if (oResourceBundle) {
            return oResourceBundle;
        }

        var oModel = oContext && oContext.getModel && oContext.getModel("i18n");
        var oView = !oModel && oContext && oContext.getView && oContext.getView();
        oModel = oModel || (oView && oView.getModel("i18n"));
        return oModel && oModel.getResourceBundle();
    }

    function getText(oContext, sKey, aArgs) {
        var oBundle = getBundle(oContext);
        return oBundle ? oBundle.getText(sKey, aArgs) : sKey;
    }

    var oAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 3
    });

    var oIntegerFormat = NumberFormat.getIntegerInstance({
        groupingEnabled: true
    });

    var oDateFormat = DateFormat.getDateInstance({
        style: "medium"
    });

    return {
        setResourceBundle: function (oBundle) {
            oResourceBundle = oBundle;
        },

        currency: function (vAmount, sCurrency) {
            var fAmount = toNumber(vAmount);
            if (fAmount === null) {
                return "";
            }

            return [oAmountFormat.format(fAmount), sCurrency].filter(Boolean).join(" ");
        },

        integer: function (vValue) {
            var fValue = toNumber(vValue);
            return fValue === null ? "" : oIntegerFormat.format(fValue);
        },

        count: function (vValue) {
            var fValue = toNumber(vValue);
            if (fValue === null) {
                return "";
            }

            return getText(this, "countValue", [oIntegerFormat.format(fValue)]);
        },

        percent: function (vValue) {
            var fValue = toNumber(vValue);
            if (fValue === null) {
                return "";
            }

            return oAmountFormat.format(fValue) + "%";
        },

        variancePercent: function (vVariance, vBase) {
            var fVariance = toNumber(vVariance);
            var fBase = toNumber(vBase);
            if (fVariance === null || fBase === null || fBase === 0) {
                return "";
            }

            return oAmountFormat.format((fVariance / fBase) * 100) + "%";
        },

        amountState: function (vValue) {
            var fValue = toNumber(vValue);
            if (fValue === null || fValue === 0) {
                return ValueState.None;
            }

            return fValue > 0 ? ValueState.Error : ValueState.Success;
        },

        actualStatusText: function (sActualExists, sActualCalcTarget, sActualStatus) {
            if (sActualExists === "X") {
                return getText(this, "statusDone");
            }

            if (sActualCalcTarget === "X") {
                return getText(this, "statusTarget");
            }

            return sActualStatus || getText(this, "statusDisplayOnly");
        },

        actualStatusState: function (sActualExists, sActualCalcTarget) {
            if (sActualExists === "X") {
                return ValueState.Success;
            }

            if (sActualCalcTarget === "X") {
                return ValueState.Warning;
            }

            return ValueState.None;
        },

        historyStatusText: function (sStatus) {
            if (sStatus === "X" || sStatus === "S") {
                return getText(this, "statusDone");
            }

            if (!sStatus) {
                return "";
            }

            return sStatus;
        },

        historyStatusState: function (sStatus) {
            if (sStatus === "X" || sStatus === "S") {
                return ValueState.Success;
            }

            if (!sStatus) {
                return ValueState.None;
            }

            return ValueState.Warning;
        },

        date: function (vDate) {
            if (isEmpty(vDate)) {
                return "";
            }

            var oDate = vDate instanceof Date ? vDate : new Date(vDate);
            return Number.isNaN(oDate.getTime()) ? "" : oDateFormat.format(oDate);
        },

        optionText: function (sCode, sText) {
            if (sCode && sText) {
                return sCode + " - " + sText;
            }

            return sText || sCode || "";
        },

        codeText: function (sCode, sText) {
            if (sCode && sText) {
                return sCode + " - " + sText;
            }

            return sText || sCode || "";
        },

        listCount: function (aItems) {
            if (!Array.isArray(aItems)) {
                return "";
            }

            return getText(this, "listCount", [oIntegerFormat.format(aItems.length)]);
        }
    };
});
