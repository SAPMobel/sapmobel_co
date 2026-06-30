sap.ui.define([
    "sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
    "use strict";

    var oAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        maxFractionDigits: 0
    });

    var oCompactAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 1
    });

    var oDecimalFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 2
    });

    function isNumber(vValue) {
        return vValue !== null && vValue !== undefined && vValue !== "" && isFinite(Number(vValue));
    }

    function compactAmount(vValue) {
        var fValue = Number(vValue);
        var fAbsValue = Math.abs(fValue);
        var aUnits = [{
            value: 100000000,
            text: "억"
        }, {
            value: 10000000,
            text: "천만원"
        }, {
            value: 1000000,
            text: "백만원"
        }, {
            value: 10000,
            text: "만원"
        }];
        var i;

        for (i = 0; i < aUnits.length; i += 1) {
            if (fAbsValue >= aUnits[i].value) {
                return oCompactAmountFormat.format(fValue / aUnits[i].value) + aUnits[i].text;
            }
        }

        return oAmountFormat.format(fValue);
    }

    return {
        amount: function (vValue) {
            if (!isNumber(vValue)) {
                return "-";
            }
            return compactAmount(vValue);
        },

        decimal: function (vValue) {
            if (!isNumber(vValue)) {
                return "-";
            }
            return oDecimalFormat.format(Number(vValue));
        },

        integer: function (vValue) {
            if (!isNumber(vValue)) {
                return "-";
            }
            return oAmountFormat.format(Number(vValue));
        },

        percent: function (vValue) {
            if (!isNumber(vValue)) {
                return "-";
            }
            return oDecimalFormat.format(Number(vValue) * 100) + "%";
        },

        percentPoint: function (vValue) {
            if (!isNumber(vValue)) {
                return "-";
            }
            return oDecimalFormat.format(Number(vValue)) + "%";
        },

        stateByAmount: function (vValue) {
            if (!isNumber(vValue) || Number(vValue) === 0) {
                return "None";
            }
            return Number(vValue) > 0 ? "Success" : "Error";
        },

        stateByRate: function (vValue) {
            if (!isNumber(vValue) || Number(vValue) === 0) {
                return "None";
            }
            return Number(vValue) > 0 ? "Success" : "Error";
        },

        stateByCostDifference: function (vValue) {
            if (!isNumber(vValue) || Number(vValue) === 0) {
                return "None";
            }
            return Number(vValue) > 0 ? "Error" : "Success";
        },

        stateByProfitDifference: function (vValue) {
            if (!isNumber(vValue) || Number(vValue) === 0) {
                return "None";
            }
            return Number(vValue) > 0 ? "Success" : "Error";
        }
    };
});
