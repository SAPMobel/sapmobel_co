sap.ui.define([
    "sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
    "use strict";

    var oAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        maxFractionDigits: 0
    });

    var oDecimalFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 2
    });

    function isNumber(vValue) {
        return vValue !== null && vValue !== undefined && vValue !== "" && isFinite(Number(vValue));
    }

    return {
        amount: function (vValue) {
            if (!isNumber(vValue)) {
                return "-";
            }
            return oAmountFormat.format(Number(vValue));
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
        }
    };
});
