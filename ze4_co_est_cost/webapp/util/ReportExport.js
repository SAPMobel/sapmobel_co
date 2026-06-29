sap.ui.define([
    "sap/m/MessageBox"
], function (MessageBox) {
    "use strict";

    var MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    var ZIP_DOS_DATE = 33;
    var CRC_TABLE = makeCrcTable();
    var STYLE = {
        DEFAULT: 0,
        COVER_TITLE: 1,
        COVER_SUBTITLE: 2,
        SECTION_TITLE: 3,
        LABEL: 4,
        VALUE: 5,
        HEADER: 6,
        TEXT: 7,
        AMOUNT: 8,
        INTEGER: 9,
        PERCENT: 10,
        TOTAL_LABEL: 11,
        TOTAL_NUMBER: 12,
        MUTED: 13,
        BAD: 14,
        GOOD: 15
    };
    var VARIANTS = {
        default: { accent: "#0A6ED1", dark: "#102A43", soft: "#EAF4FF", band: "#F6F8FB" },
        standard: { accent: "#0A6ED1", dark: "#102A43", soft: "#EAF4FF", band: "#F6F8FB" },
        estimate: { accent: "#256F3A", dark: "#174A27", soft: "#EBF7EE", band: "#F7FBF8" },
        profitability: { accent: "#8A4B00", dark: "#4A2B00", soft: "#FFF3E0", band: "#FFF9F0" },
        costcenter: { accent: "#0F6B78", dark: "#084C56", soft: "#E7F6F8", band: "#F4FAFB" },
        allocation: { accent: "#5B4DB2", dark: "#332B77", soft: "#F0EEFF", band: "#F7F6FF" }
    };

    function makeCrcTable() {
        var aTable = [];
        var i;
        var j;
        var nCrc;

        for (i = 0; i < 256; i += 1) {
            nCrc = i;
            for (j = 0; j < 8; j += 1) {
                nCrc = nCrc & 1 ? 0xedb88320 ^ (nCrc >>> 1) : nCrc >>> 1;
            }
            aTable[i] = nCrc >>> 0;
        }
        return aTable;
    }

    function crc32(aBytes) {
        var nCrc = 0xffffffff;
        var i;

        for (i = 0; i < aBytes.length; i += 1) {
            nCrc = CRC_TABLE[(nCrc ^ aBytes[i]) & 0xff] ^ (nCrc >>> 8);
        }
        return (nCrc ^ 0xffffffff) >>> 0;
    }

    function utf8(sText) {
        var sValue = String(sText || "");
        var sEncoded;
        var aBytes;
        var i;

        if (typeof TextEncoder !== "undefined") {
            return new TextEncoder().encode(sValue);
        }

        sEncoded = unescape(encodeURIComponent(sValue));
        aBytes = new Uint8Array(sEncoded.length);
        for (i = 0; i < sEncoded.length; i += 1) {
            aBytes[i] = sEncoded.charCodeAt(i);
        }
        return aBytes;
    }

    function bytes(aValues) {
        return new Uint8Array(aValues);
    }

    function u16(nValue) {
        return [nValue & 0xff, (nValue >>> 8) & 0xff];
    }

    function u32(nValue) {
        return [
            nValue & 0xff,
            (nValue >>> 8) & 0xff,
            (nValue >>> 16) & 0xff,
            (nValue >>> 24) & 0xff
        ];
    }

    function concatArrays(aArrays) {
        var iLength = aArrays.reduce(function (iTotal, aPart) {
            return iTotal + aPart.length;
        }, 0);
        var aOut = new Uint8Array(iLength);
        var iOffset = 0;

        aArrays.forEach(function (aPart) {
            aOut.set(aPart, iOffset);
            iOffset += aPart.length;
        });
        return aOut;
    }

    function zip(aFiles) {
        var aLocalParts = [];
        var aCentralParts = [];
        var iOffset = 0;

        aFiles.forEach(function (oFile) {
            var aName = utf8(oFile.name);
            var aData = utf8(oFile.content);
            var nCrc = crc32(aData);
            var aLocalHeader = bytes([].concat(
                u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(ZIP_DOS_DATE),
                u32(nCrc), u32(aData.length), u32(aData.length), u16(aName.length), u16(0)
            ));
            var aCentralHeader = bytes([].concat(
                u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(ZIP_DOS_DATE),
                u32(nCrc), u32(aData.length), u32(aData.length), u16(aName.length), u16(0), u16(0),
                u16(0), u16(0), u32(0), u32(iOffset)
            ));

            aLocalParts.push(aLocalHeader, aName, aData);
            aCentralParts.push(aCentralHeader, aName);
            iOffset += aLocalHeader.length + aName.length + aData.length;
        });

        return concatArrays(aLocalParts.concat(aCentralParts, [
            bytes([].concat(
                u32(0x06054b50), u16(0), u16(0), u16(aFiles.length), u16(aFiles.length),
                u32(aCentralParts.reduce(function (iTotal, aPart) {
                    return iTotal + aPart.length;
                }, 0)),
                u32(iOffset), u16(0)
            ))
        ]));
    }

    function xml(vValue) {
        return String(vValue === null || vValue === undefined ? "" : vValue)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function html(vValue) {
        return String(vValue === null || vValue === undefined ? "" : vValue)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function clean(vValue) {
        if (vValue === null || vValue === undefined || vValue === "") {
            return "-";
        }
        return String(vValue);
    }

    function asArray(vValue) {
        return Array.isArray(vValue) ? vValue : [];
    }

    function pad(nValue) {
        return String(nValue).padStart(2, "0");
    }

    function timestamp() {
        var oDate = new Date();

        return oDate.getFullYear() + "-" + pad(oDate.getMonth() + 1) + "-" + pad(oDate.getDate()) + " " +
            pad(oDate.getHours()) + ":" + pad(oDate.getMinutes());
    }

    function fileDate() {
        var oDate = new Date();

        return oDate.getFullYear() + pad(oDate.getMonth() + 1) + pad(oDate.getDate()) + "_" +
            pad(oDate.getHours()) + pad(oDate.getMinutes());
    }

    function normalizeFileName(sName, sExtension) {
        var sBase = String(sName || "report")
            .replace(/[\\/:*?"<>|]/g, "_")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");

        return (sBase || "report") + "_" + fileDate() + "." + sExtension;
    }

    function normalizeSheetName(sName, mUsedNames) {
        var sBase = String(sName || "Sheet")
            .replace(/[\[\]:*?/\\]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 31) || "Sheet";
        var sCandidate = sBase;
        var i = 2;

        while (mUsedNames[sCandidate]) {
            sCandidate = sBase.slice(0, Math.max(1, 31 - String(i).length - 1)) + "_" + i;
            i += 1;
        }
        mUsedNames[sCandidate] = true;
        return sCandidate;
    }

    function columnName(iIndex) {
        var sName = "";
        var iNum = iIndex + 1;

        while (iNum > 0) {
            iNum -= 1;
            sName = String.fromCharCode(65 + (iNum % 26)) + sName;
            iNum = Math.floor(iNum / 26);
        }
        return sName;
    }

    function getByPath(oObject, sPath) {
        return String(sPath || "").split("/").reduce(function (vCurrent, sPart) {
            return vCurrent && sPart ? vCurrent[sPart] : vCurrent;
        }, oObject);
    }

    function valueForColumn(oRow, oColumn) {
        if (oColumn.value) {
            return oColumn.value(oRow);
        }
        return getByPath(oRow, oColumn.property || oColumn.path);
    }

    function rawValueForColumn(oRow, oColumn) {
        if (oColumn.rawValue) {
            return oColumn.rawValue(oRow);
        }
        if (oColumn.rawProperty || oColumn.rawPath) {
            return getByPath(oRow, oColumn.rawProperty || oColumn.rawPath);
        }
        return valueForColumn(oRow, oColumn);
    }

    function inferColumns(aRows) {
        var mSeen = {};
        var aColumns = [];

        asArray(aRows).forEach(function (oRow) {
            Object.keys(oRow || {}).forEach(function (sKey) {
                if (!mSeen[sKey] && sKey.indexOf("__") !== 0 && sKey !== "raw" && sKey !== "_groupRows" && typeof oRow[sKey] !== "object") {
                    mSeen[sKey] = true;
                    aColumns.push({ label: sKey, property: sKey });
                }
            });
        });
        return aColumns;
    }

    function sectionColumns(oSection) {
        return oSection && oSection.columns && oSection.columns.length ? oSection.columns : inferColumns(oSection && oSection.rows || []);
    }

    function inferColumnType(oColumn) {
        var sLabel = String(oColumn.label || oColumn.property || "");

        if (oColumn.type) {
            return oColumn.type;
        }
        if (/율|비중|%|Rate|rate|Percent|percent/.test(sLabel)) {
            return "percent";
        }
        if (/건수|수량|라인|순위|레벨|Count|count|Qty|qty|Quantity|quantity/.test(sLabel)) {
            return "integer";
        }
        if (/금액|원가|단가|실적|예산|차이|매출|이익|비용|잔액|합계|배부|Amount|amount|Cost|cost|Price|price|Profit|profit|Revenue|revenue|Sales|sales/.test(sLabel)) {
            return "amount";
        }
        if (/일자|날짜|Date|date/.test(sLabel)) {
            return "date";
        }
        return "text";
    }

    function isNumericType(sType) {
        return sType === "amount" || sType === "integer" || sType === "percent" || sType === "number";
    }

    function parseNumber(vValue, sType) {
        var sText;
        var bPercent;
        var bNegative;
        var fNumber;

        if (typeof vValue === "number" && isFinite(vValue)) {
            return sType === "percent" && Math.abs(vValue) > 1 ? vValue / 100 : vValue;
        }
        if (vValue === null || vValue === undefined || vValue === "") {
            return NaN;
        }

        sText = String(vValue).trim();
        bPercent = sText.indexOf("%") > -1;
        bNegative = /^\(.*\)$/.test(sText);
        sText = sText
            .replace(/[,%]/g, "")
            .replace(/KRW|USD|EUR|JPY|원|건|EA|PCS|PC|KG|G|L|H|시간/gi, "")
            .replace(/[^\d.+-]/g, "");

        fNumber = Number(sText);
        if (!isFinite(fNumber)) {
            return NaN;
        }
        if (bNegative) {
            fNumber = -Math.abs(fNumber);
        }
        if (sType === "percent" && (bPercent || Math.abs(fNumber) > 1)) {
            fNumber = fNumber / 100;
        }
        return fNumber;
    }

    function typedValue(oRow, oColumn) {
        var sType = inferColumnType(oColumn);
        var vRaw = rawValueForColumn(oRow, oColumn);
        var vDisplay = valueForColumn(oRow, oColumn);
        var fNumber;

        if (isNumericType(sType)) {
            fNumber = parseNumber(vRaw, sType);
            if (!isFinite(fNumber)) {
                fNumber = parseNumber(vDisplay, sType);
            }
            if (isFinite(fNumber)) {
                return { value: fNumber, type: "number", display: clean(vDisplay) };
            }
        }
        return { value: clean(vDisplay), type: "text", display: clean(vDisplay) };
    }

    function shouldTotal(oColumn) {
        var sType = inferColumnType(oColumn);
        var sLabel = String(oColumn.label || "");

        if (oColumn.total !== undefined) {
            return !!oColumn.total;
        }
        if (!isNumericType(sType) || sType === "percent") {
            return false;
        }
        return !/순위|레벨|라인|No\.?|번호|코드|ID$/i.test(sLabel);
    }

    function variant(oReport) {
        return VARIANTS[oReport && oReport.variant] || VARIANTS.default;
    }

    function colorToArgb(sColor) {
        var sHex = String(sColor || "#0A6ED1").replace("#", "").toUpperCase();

        if (sHex.length === 3) {
            sHex = sHex.split("").map(function (sPart) {
                return sPart + sPart;
            }).join("");
        }
        return "FF" + (sHex.length === 6 ? sHex : "0A6ED1");
    }

    function hasContent(oReport) {
        return asArray(oReport.summary).length ||
            asArray(oReport.filters).length ||
            asArray(oReport.sections).some(function (oSection) {
                return asArray(oSection.rows).length;
            });
    }

    function downloadBlob(oBlob, sFileName) {
        var oUrl = URL.createObjectURL(oBlob);
        var oLink = document.createElement("a");

        oLink.href = oUrl;
        oLink.download = sFileName;
        document.body.appendChild(oLink);
        oLink.click();
        document.body.removeChild(oLink);
        setTimeout(function () {
            URL.revokeObjectURL(oUrl);
        }, 1000);
    }

    function cell(vValue, sType, iStyle) {
        return {
            value: vValue,
            type: sType || "text",
            style: iStyle === undefined ? STYLE.DEFAULT : iStyle
        };
    }

    function excelStyle(oColumn, bTotal) {
        var sType = inferColumnType(oColumn);

        if (bTotal) {
            return isNumericType(sType) ? STYLE.TOTAL_NUMBER : STYLE.TOTAL_LABEL;
        }
        if (sType === "amount" || sType === "number") {
            return STYLE.AMOUNT;
        }
        if (sType === "integer") {
            return STYLE.INTEGER;
        }
        if (sType === "percent") {
            return STYLE.PERCENT;
        }
        return STYLE.TEXT;
    }

    function totalValue(aRows, oColumn) {
        return asArray(aRows).reduce(function (fTotal, oRow) {
            var sType = inferColumnType(oColumn);
            var fValue = parseNumber(rawValueForColumn(oRow, oColumn), sType);

            if (!isFinite(fValue)) {
                fValue = parseNumber(valueForColumn(oRow, oColumn), sType);
            }
            return fTotal + (isFinite(fValue) ? fValue : 0);
        }, 0);
    }

    function columnWidth(oColumn) {
        var sType = inferColumnType(oColumn);

        if (oColumn.width) {
            return Math.max(8, Math.min(56, Number(oColumn.width) || 16));
        }
        if (sType === "text") {
            return Math.max(14, Math.min(42, String(oColumn.label || "").length + 12));
        }
        return 15;
    }

    function buildOverviewRows(oReport) {
        var aRows = [
            [cell(oReport.title || "Report", "text", STYLE.COVER_TITLE)],
            [cell(oReport.description || "현재 화면 기준 보고서", "text", STYLE.COVER_SUBTITLE)],
            [],
            [cell("생성일시", "text", STYLE.LABEL), cell(timestamp(), "text", STYLE.VALUE)],
            [cell("파일명", "text", STYLE.LABEL), cell(oReport.fileName || oReport.title || "Report", "text", STYLE.VALUE)],
            [cell("섹션 수", "text", STYLE.LABEL), cell(asArray(oReport.sections).length, "number", STYLE.INTEGER)],
            [cell("전체 데이터 건수", "text", STYLE.LABEL), cell(asArray(oReport.sections).reduce(function (iTotal, oSection) {
                return iTotal + asArray(oSection.rows).length;
            }, 0), "number", STYLE.INTEGER)],
            []
        ];

        aRows.push([cell("요약 KPI", "text", STYLE.SECTION_TITLE)]);
        asArray(oReport.summary).forEach(function (oItem) {
            aRows.push([cell(oItem.label, "text", STYLE.LABEL), cell(clean(oItem.value), "text", STYLE.VALUE)]);
        });
        aRows.push([]);
        aRows.push([cell("조회조건", "text", STYLE.SECTION_TITLE)]);
        asArray(oReport.filters).forEach(function (oItem) {
            aRows.push([cell(oItem.label, "text", STYLE.LABEL), cell(clean(oItem.value), "text", STYLE.VALUE)]);
        });
        aRows.push([]);
        aRows.push([cell("데이터 섹션", "text", STYLE.SECTION_TITLE)]);
        aRows.push([cell("섹션", "text", STYLE.HEADER), cell("행 수", "text", STYLE.HEADER)]);
        asArray(oReport.sections).forEach(function (oSection) {
            aRows.push([cell(oSection.title || "", "text", STYLE.TEXT), cell(asArray(oSection.rows).length, "number", STYLE.INTEGER)]);
        });

        return {
            name: "Overview",
            rows: aRows,
            merges: ["A1:F1", "A2:F2"],
            widths: [24, 40, 18, 18, 18, 18],
            freezeRow: 0
        };
    }

    function buildKpiRows(oReport) {
        var aRows = [
            [cell("KPI / 조회조건", "text", STYLE.SECTION_TITLE)],
            [cell("구분", "text", STYLE.HEADER), cell("항목", "text", STYLE.HEADER), cell("값", "text", STYLE.HEADER)]
        ];

        asArray(oReport.filters).forEach(function (oItem) {
            aRows.push([cell("조회조건", "text", STYLE.TEXT), cell(oItem.label, "text", STYLE.TEXT), cell(clean(oItem.value), "text", STYLE.VALUE)]);
        });
        asArray(oReport.summary).forEach(function (oItem) {
            aRows.push([cell("KPI", "text", STYLE.TEXT), cell(oItem.label, "text", STYLE.TEXT), cell(clean(oItem.value), "text", STYLE.VALUE)]);
        });

        return {
            name: "KPI",
            rows: aRows,
            merges: ["A1:C1"],
            widths: [16, 28, 44],
            freezeRow: 2,
            autoFilter: "A2:C" + Math.max(2, aRows.length)
        };
    }

    function buildChartDataRows(oReport) {
        var aRows = [[cell("Chart Data", "text", STYLE.SECTION_TITLE)], []];

        asArray(oReport.charts).forEach(function (oChart) {
            var oSection = asArray(oReport.sections).find(function (oCandidate) {
                return oCandidate.title === oChart.sourceSectionTitle || oCandidate.sheetName === oChart.sourceSectionTitle;
            });
            var aColumns = sectionColumns(oSection || {});

            aRows.push([cell(oChart.title || oChart.sourceSectionTitle || "Chart", "text", STYLE.SECTION_TITLE)]);
            if (!oSection || !aColumns.length) {
                aRows.push([cell("원천 데이터 없음", "text", STYLE.MUTED)]);
                aRows.push([]);
                return;
            }
            aRows.push(aColumns.map(function (oColumn) {
                return cell(oColumn.label || oColumn.property || "", "text", STYLE.HEADER);
            }));
            asArray(oSection.rows).forEach(function (oRow) {
                aRows.push(aColumns.map(function (oColumn) {
                    var oValue = typedValue(oRow, oColumn);
                    return cell(oValue.value, oValue.type, excelStyle(oColumn, false));
                }));
            });
            aRows.push([]);
        });

        return {
            name: "Chart Data",
            rows: aRows,
            merges: ["A1:H1"],
            widths: [20, 20, 20, 20, 20, 20, 20, 20],
            freezeRow: 0
        };
    }

    function buildSectionSheet(oSection, mUsedNames) {
        var aColumns = sectionColumns(oSection);
        var aRows = asArray(oSection.rows);
        var aOut = [
            [cell(oSection.title || "", "text", STYLE.SECTION_TITLE)],
            [cell("데이터 건수", "text", STYLE.LABEL), cell(aRows.length, "number", STYLE.INTEGER)],
            []
        ];
        var aWidths = [];
        var bHasTotal = false;
        var iLastColumn = Math.max(1, aColumns.length);
        var aTotalRow;

        if (!aColumns.length) {
            aOut.push([cell("데이터 없음", "text", STYLE.MUTED)]);
            return {
                name: normalizeSheetName("Data_" + (oSection.sheetName || oSection.title), mUsedNames),
                rows: aOut,
                merges: ["A1:A1"],
                widths: [24],
                freezeRow: 0
            };
        }

        aOut.push(aColumns.map(function (oColumn) {
            aWidths.push(columnWidth(oColumn));
            return cell(oColumn.label || oColumn.property || "", "text", STYLE.HEADER);
        }));
        aRows.forEach(function (oRow) {
            aOut.push(aColumns.map(function (oColumn) {
                var oValue = typedValue(oRow, oColumn);
                return cell(oValue.value, oValue.type, excelStyle(oColumn, false));
            }));
        });

        if (aRows.length) {
            aTotalRow = aColumns.map(function (oColumn, iIndex) {
                if (iIndex === 0) {
                    return cell("합계", "text", STYLE.TOTAL_LABEL);
                }
                if (shouldTotal(oColumn)) {
                    bHasTotal = true;
                    return cell(totalValue(aRows, oColumn), "number", STYLE.TOTAL_NUMBER);
                }
                return cell("", "text", STYLE.TOTAL_LABEL);
            });
            if (bHasTotal) {
                aOut.push(aTotalRow);
            }
        }

        return {
            name: normalizeSheetName("Data_" + (oSection.sheetName || oSection.title), mUsedNames),
            rows: aOut,
            merges: ["A1:" + columnName(iLastColumn - 1) + "1"],
            widths: aWidths,
            freezeRow: 4,
            autoFilter: "A4:" + columnName(iLastColumn - 1) + Math.max(4, aOut.length)
        };
    }

    function workbookSheets(oReport) {
        var mUsedNames = {};
        var aSheets = [];

        aSheets.push(Object.assign(buildOverviewRows(oReport), { name: normalizeSheetName("Overview", mUsedNames) }));
        aSheets.push(Object.assign(buildKpiRows(oReport), { name: normalizeSheetName("KPI", mUsedNames) }));
        if (asArray(oReport.charts).length) {
            aSheets.push(Object.assign(buildChartDataRows(oReport), { name: normalizeSheetName("Chart Data", mUsedNames) }));
        }
        asArray(oReport.sections).forEach(function (oSection) {
            aSheets.push(buildSectionSheet(oSection, mUsedNames));
        });
        return aSheets;
    }

    function worksheetXml(oSheet) {
        var iMaxColumns = Math.max(1, asArray(oSheet.widths).length, oSheet.rows.reduce(function (iMax, aRow) {
            return Math.max(iMax, asArray(aRow).length);
        }, 1));
        var aXml = [
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
            "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">",
            "<dimension ref=\"A1:" + columnName(iMaxColumns - 1) + Math.max(1, oSheet.rows.length) + "\"/>",
            "<sheetViews><sheetView workbookViewId=\"0\">"
        ];
        var i;

        if (oSheet.freezeRow) {
            aXml.push("<pane ySplit=\"" + oSheet.freezeRow + "\" topLeftCell=\"A" + (oSheet.freezeRow + 1) + "\" activePane=\"bottomLeft\" state=\"frozen\"/>");
        }
        aXml.push("</sheetView></sheetViews><sheetFormatPr defaultRowHeight=\"18\"/><cols>");
        for (i = 1; i <= iMaxColumns; i += 1) {
            aXml.push("<col min=\"" + i + "\" max=\"" + i + "\" width=\"" + (asArray(oSheet.widths)[i - 1] || 18) + "\" customWidth=\"1\"/>");
        }
        aXml.push("</cols><sheetData>");
        oSheet.rows.forEach(function (aRow, iRowIndex) {
            var iHeight = iRowIndex === 0 ? 28 : 18;

            aXml.push("<row r=\"" + (iRowIndex + 1) + "\" ht=\"" + iHeight + "\" customHeight=\"1\">");
            asArray(aRow).forEach(function (oCell, iColumnIndex) {
                var sRef = columnName(iColumnIndex) + (iRowIndex + 1);
                var iStyle = oCell && oCell.style !== undefined ? oCell.style : STYLE.DEFAULT;
                var vValue = oCell && oCell.value !== undefined ? oCell.value : "";
                var fNumber = oCell && oCell.type === "number" ? Number(vValue) : NaN;

                if (isFinite(fNumber)) {
                    aXml.push("<c r=\"" + sRef + "\" s=\"" + iStyle + "\"><v>" + fNumber + "</v></c>");
                } else {
                    aXml.push("<c r=\"" + sRef + "\" s=\"" + iStyle + "\" t=\"inlineStr\"><is><t xml:space=\"preserve\">" + xml(vValue === "" ? "" : clean(vValue)) + "</t></is></c>");
                }
            });
            aXml.push("</row>");
        });
        aXml.push("</sheetData>");

        if (asArray(oSheet.merges).length) {
            aXml.push("<mergeCells count=\"" + oSheet.merges.length + "\">");
            oSheet.merges.forEach(function (sMerge) {
                aXml.push("<mergeCell ref=\"" + xml(sMerge) + "\"/>");
            });
            aXml.push("</mergeCells>");
        }
        if (oSheet.autoFilter) {
            aXml.push("<autoFilter ref=\"" + xml(oSheet.autoFilter) + "\"/>");
        }
        aXml.push("</worksheet>");
        return aXml.join("");
    }

    function stylesXml(oReport) {
        var oVariant = variant(oReport || {});
        var sAccent = colorToArgb(oVariant.accent);
        var sDark = colorToArgb(oVariant.dark);
        var sSoft = colorToArgb(oVariant.soft);
        var sBand = colorToArgb(oVariant.band);

        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
            "<numFmts count=\"3\"><numFmt numFmtId=\"164\" formatCode=\"#,##0\"/><numFmt numFmtId=\"165\" formatCode=\"0.0%\"/><numFmt numFmtId=\"166\" formatCode=\"#,##0.00\"/></numFmts>" +
            "<fonts count=\"6\"><font><sz val=\"10\"/><name val=\"Arial\"/></font><font><b/><sz val=\"16\"/><color rgb=\"FFFFFFFF\"/><name val=\"Arial\"/></font><font><b/><sz val=\"11\"/><color rgb=\"" + sDark + "\"/><name val=\"Arial\"/></font><font><b/><sz val=\"10\"/><color rgb=\"FFFFFFFF\"/><name val=\"Arial\"/></font><font><b/><sz val=\"10\"/><color rgb=\"FFC62828\"/><name val=\"Arial\"/></font><font><b/><sz val=\"10\"/><color rgb=\"FF107E3E\"/><name val=\"Arial\"/></font></fonts>" +
            "<fills count=\"7\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"" + sAccent + "\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"" + sDark + "\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"" + sSoft + "\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"" + sBand + "\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFFFF3CD\"/><bgColor indexed=\"64\"/></patternFill></fill></fills>" +
            "<borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style=\"thin\"><color rgb=\"FFD9E2EC\"/></left><right style=\"thin\"><color rgb=\"FFD9E2EC\"/></right><top style=\"thin\"><color rgb=\"FFD9E2EC\"/></top><bottom style=\"thin\"><color rgb=\"FFD9E2EC\"/></bottom><diagonal/></border></borders>" +
            "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
            "<cellXfs count=\"16\">" +
            "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>" +
            "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"><alignment vertical=\"center\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"><alignment vertical=\"center\" wrapText=\"1\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"4\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"/>" +
            "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"5\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"/>" +
            "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyBorder=\"1\"/>" +
            "<xf numFmtId=\"0\" fontId=\"3\" fillId=\"3\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"><alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyBorder=\"1\"><alignment vertical=\"top\" wrapText=\"1\"/></xf>" +
            "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyBorder=\"1\"><alignment horizontal=\"right\"/></xf>" +
            "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyBorder=\"1\"><alignment horizontal=\"right\"/></xf>" +
            "<xf numFmtId=\"165\" fontId=\"0\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyBorder=\"1\"><alignment horizontal=\"right\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"2\" fillId=\"5\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"/>" +
            "<xf numFmtId=\"164\" fontId=\"2\" fillId=\"5\" borderId=\"1\" xfId=\"0\" applyNumberFormat=\"1\" applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\"><alignment horizontal=\"right\"/></xf>" +
            "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"5\" borderId=\"1\" xfId=\"0\" applyFill=\"1\" applyBorder=\"1\"/>" +
            "<xf numFmtId=\"0\" fontId=\"4\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyBorder=\"1\"/>" +
            "<xf numFmtId=\"0\" fontId=\"5\" fillId=\"0\" borderId=\"1\" xfId=\"0\" applyFont=\"1\" applyBorder=\"1\"/>" +
            "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";
    }

    function buildWorkbookXml(aSheets) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><workbookViews><workbookView/></workbookViews><sheets>" +
            aSheets.map(function (oSheet, iIndex) {
                return "<sheet name=\"" + xml(oSheet.name) + "\" sheetId=\"" + (iIndex + 1) + "\" r:id=\"rId" + (iIndex + 1) + "\"/>";
            }).join("") +
            "</sheets></workbook>";
    }

    function buildWorkbookRels(aSheets) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
            aSheets.map(function (oSheet, iIndex) {
                return "<Relationship Id=\"rId" + (iIndex + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet" + (iIndex + 1) + ".xml\"/>";
            }).join("") +
            "<Relationship Id=\"rId" + (aSheets.length + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>";
    }

    function contentTypes(aSheets) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
            "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
            aSheets.map(function (oSheet, iIndex) {
                return "<Override PartName=\"/xl/worksheets/sheet" + (iIndex + 1) + ".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>";
            }).join("") +
            "</Types>";
    }

    function rootRels() {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
    }

    function buildXlsx(oReport) {
        var aSheets = workbookSheets(oReport);
        var aFiles = [
            { name: "[Content_Types].xml", content: contentTypes(aSheets) },
            { name: "_rels/.rels", content: rootRels() },
            { name: "xl/workbook.xml", content: buildWorkbookXml(aSheets) },
            { name: "xl/styles.xml", content: stylesXml(oReport) },
            { name: "xl/_rels/workbook.xml.rels", content: buildWorkbookRels(aSheets) }
        ];

        aSheets.forEach(function (oSheet, iIndex) {
            aFiles.push({
                name: "xl/worksheets/sheet" + (iIndex + 1) + ".xml",
                content: worksheetXml(oSheet)
            });
        });
        return zip(aFiles);
    }

    function sectionNumericSummary(oSection) {
        var aColumns = sectionColumns(oSection).filter(shouldTotal).slice(0, 4);

        return aColumns.map(function (oColumn) {
            return {
                label: oColumn.label || oColumn.property || "",
                value: totalValue(oSection.rows, oColumn)
            };
        });
    }

    function formatPdfNumber(vValue) {
        if (typeof vValue !== "number" || !isFinite(vValue)) {
            return clean(vValue);
        }
        return vValue.toLocaleString();
    }

    function topRows(oSection, iLimit) {
        var aColumns = sectionColumns(oSection);
        var oAmountColumn = aColumns.find(function (oColumn) {
            return inferColumnType(oColumn) === "amount" || shouldTotal(oColumn);
        }) || aColumns[1] || aColumns[0];

        if (!oAmountColumn) {
            return asArray(oSection.rows).slice(0, iLimit || 5);
        }

        return asArray(oSection.rows).slice().sort(function (oA, oB) {
            return Math.abs(parseNumber(rawValueForColumn(oB, oAmountColumn), inferColumnType(oAmountColumn)) || 0) -
                Math.abs(parseNumber(rawValueForColumn(oA, oAmountColumn), inferColumnType(oAmountColumn)) || 0);
        }).slice(0, iLimit || 5);
    }

    function pdfCss(oReport) {
        var oVariant = variant(oReport);

        return "@page{size:A4 landscape;margin:11mm 16mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#172B4D;background:#fff;font-size:10px}.page{break-after:page;min-height:185mm}.page:last-child{break-after:auto}.cover{display:grid;grid-template-columns:1.25fr .75fr;gap:18px;min-height:185mm}.brandBar{height:7px;background:" + oVariant.accent + ";margin-bottom:18px}.eyebrow{font-size:10px;font-weight:900;color:" + oVariant.accent + ";letter-spacing:0;text-transform:uppercase}.title{font-size:26px;line-height:1.18;margin:6px 0 9px;color:" + oVariant.dark + ";font-weight:900}.desc{font-size:11px;color:#526376;margin:0 0 16px}.metaPanel{border:1px solid #D9E2EC;background:" + oVariant.band + ";padding:13px}.metaGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.metric{border:1px solid #D9E2EC;background:" + oVariant.soft + ";padding:9px;min-height:52px}.metric span,.kvItem span{display:block;color:#5B6B7F;font-weight:800;font-size:8px;margin-bottom:3px}.metric strong{font-size:12px;color:" + oVariant.dark + ";word-break:break-word}.kvGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.kvItem{border-bottom:1px solid #DDE6EF;padding:5px 0}.kvItem strong{font-size:9px;color:#172B4D}.section{break-inside:avoid;margin-bottom:11px}.sectionHeader{display:flex;justify-content:space-between;gap:8px;align-items:flex-end;border-bottom:2px solid " + oVariant.accent + ";padding-bottom:4px;margin-bottom:7px}.sectionHeader h2{font-size:14px;color:" + oVariant.dark + ";margin:0}.sectionHeader span{font-size:8px;color:#6A7785;font-weight:800}.summaryGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.summaryCard{border:1px solid #D9E2EC;background:#fff;padding:8px}.summaryCard span{display:block;color:#5B6B7F;font-weight:800;font-size:8px}.summaryCard strong{display:block;color:" + oVariant.dark + ";font-size:12px;margin-top:4px}.barRow{display:grid;grid-template-columns:1.1fr 2fr .9fr;gap:8px;align-items:center;margin:5px 0}.barLabel{font-weight:800;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.barTrack{height:8px;background:#E8EEF5;border-radius:999px;overflow:hidden}.barFill{height:8px;background:" + oVariant.accent + "}.barValue{text-align:right;font-weight:800;font-size:9px;color:" + oVariant.dark + "}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}th{background:" + oVariant.dark + ";color:#fff;padding:5px;text-align:left;font-weight:900}td{border:1px solid #DDE6EF;padding:4px;vertical-align:top;word-break:keep-all;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#F8FAFC}.num{text-align:right}.note{color:#6A7785;font-size:8px;margin-top:5px}.footer{position:fixed;bottom:4mm;left:16mm;right:16mm;border-top:1px solid #DDE6EF;padding-top:3px;color:#7B8794;font-size:8px;display:flex;justify-content:space-between}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}";
    }

    function metricHtml(aItems, iLimit) {
        return asArray(aItems).slice(0, iLimit || 12).map(function (oItem) {
            return "<div class=\"metric\"><span>" + html(oItem.label) + "</span><strong>" + html(clean(oItem.value)) + "</strong></div>";
        }).join("");
    }

    function kvHtml(aItems, iLimit) {
        return asArray(aItems).slice(0, iLimit || 20).map(function (oItem) {
            return "<div class=\"kvItem\"><span>" + html(oItem.label) + "</span><strong>" + html(clean(oItem.value)) + "</strong></div>";
        }).join("");
    }

    function sectionTableHtml(oSection, iLimit) {
        var aColumns = sectionColumns(oSection).slice(0, 10);
        var aRows = asArray(oSection.rows).slice(0, iLimit || 12);

        if (!aColumns.length) {
            return "<p class=\"note\">데이터 없음</p>";
        }
        return "<table><thead><tr>" + aColumns.map(function (oColumn) {
            return "<th>" + html(oColumn.label || oColumn.property || "") + "</th>";
        }).join("") + "</tr></thead><tbody>" + aRows.map(function (oRow) {
            return "<tr>" + aColumns.map(function (oColumn) {
                var sType = inferColumnType(oColumn);
                return "<td class=\"" + (isNumericType(sType) ? "num" : "") + "\">" + html(clean(valueForColumn(oRow, oColumn))) + "</td>";
            }).join("") + "</tr>";
        }).join("") + "</tbody></table>" +
            (asArray(oSection.rows).length > aRows.length ? "<p class=\"note\">상위 " + aRows.length + "건만 표시. 전체 데이터는 Excel 시트에 포함됩니다.</p>" : "");
    }

    function sectionInsightHtml(oSection) {
        var aSummary = sectionNumericSummary(oSection);
        var aRows = topRows(oSection, 5);
        var aColumns = sectionColumns(oSection);
        var oLabelColumn = aColumns[0];
        var oValueColumn = aColumns.find(function (oColumn) {
            return inferColumnType(oColumn) === "amount" || shouldTotal(oColumn);
        }) || aColumns[1];
        var fMax = Math.max.apply(Math, aRows.map(function (oRow) {
            return Math.abs(parseNumber(rawValueForColumn(oRow, oValueColumn || {}), inferColumnType(oValueColumn || {})) || 0);
        }).concat([1]));

        return "<div class=\"section\"><div class=\"sectionHeader\"><h2>" + html(oSection.title) + "</h2><span>" + asArray(oSection.rows).length + " rows</span></div>" +
            (aSummary.length ? "<div class=\"summaryGrid\">" + aSummary.map(function (oItem) {
                return "<div class=\"summaryCard\"><span>" + html(oItem.label) + "</span><strong>" + html(formatPdfNumber(oItem.value)) + "</strong></div>";
            }).join("") + "</div>" : "") +
            (oLabelColumn && oValueColumn ? "<div style=\"margin-top:8px\">" + aRows.map(function (oRow) {
                var fValue = parseNumber(rawValueForColumn(oRow, oValueColumn), inferColumnType(oValueColumn)) || 0;
                var iWidth = Math.max(3, Math.round(Math.abs(fValue) / fMax * 100));

                return "<div class=\"barRow\"><div class=\"barLabel\">" + html(clean(valueForColumn(oRow, oLabelColumn))) + "</div><div class=\"barTrack\"><div class=\"barFill\" style=\"width:" + iWidth + "%\"></div></div><div class=\"barValue\">" + html(clean(valueForColumn(oRow, oValueColumn))) + "</div></div>";
            }).join("") + "</div>" : "") +
            "<div style=\"margin-top:8px\">" + sectionTableHtml(oSection, 8) + "</div></div>";
    }

    function pdfHtml(oReport) {
        var aSections = asArray(oReport.sections);
        var aPrimarySections = aSections.slice(0, 6);

        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/><title>" + html(oReport.title || "Report") + "</title><style>" + pdfCss(oReport) + "</style></head><body>" +
            "<div class=\"footer\"><span>EverNiture CO Report</span><span>" + html(timestamp()) + "</span></div>" +
            "<section class=\"page cover\"><div><div class=\"brandBar\"></div><div class=\"eyebrow\">Management Report</div><div class=\"title\">" + html(oReport.title || "Report") + "</div><p class=\"desc\">" + html(oReport.description || "현재 화면에 로드된 데이터 기준 보고서") + "</p><div class=\"metricGrid\">" + metricHtml([
                { label: "생성일시", value: timestamp() },
                { label: "파일명", value: oReport.fileName || oReport.title || "Report" },
                { label: "섹션 수", value: aSections.length },
                { label: "전체 데이터", value: aSections.reduce(function (iTotal, oSection) { return iTotal + asArray(oSection.rows).length; }, 0) + "건" }
            ], 4) + "</div><div class=\"sectionHeader\"><h2>요약 KPI</h2><span>현재 조회 결과 기준</span></div><div class=\"metricGrid\">" + metricHtml(oReport.summary, 12) + "</div></div><aside class=\"metaPanel\"><div class=\"sectionHeader\"><h2>조회조건</h2><span>Filters</span></div><div class=\"kvGrid\">" + kvHtml(oReport.filters, 24) + "</div></aside></section>" +
            "<section class=\"page\"><div class=\"brandBar\"></div><div class=\"sectionHeader\"><h2>Executive Summary</h2><span>주요 지표 및 데이터 섹션</span></div>" + aPrimarySections.map(sectionInsightHtml).join("") + "</section>" +
            aSections.slice(6).map(function (oSection) {
                return "<section class=\"page\"><div class=\"brandBar\"></div>" + sectionInsightHtml(oSection) + "</section>";
            }).join("") +
            "</body></html>";
    }

    return {
        clean: clean,
        timestamp: timestamp,
        getByPath: getByPath,
        labelRows: function (oObject, aDefinitions) {
            return asArray(aDefinitions).map(function (oDefinition) {
                return {
                    label: oDefinition.label,
                    value: oDefinition.value ? oDefinition.value(oObject || {}) : getByPath(oObject || {}, oDefinition.path || oDefinition.property)
                };
            });
        },
        kpiRows: function (aKpis) {
            return asArray(aKpis).map(function (oKpi) {
                return {
                    label: oKpi.title || oKpi.label || "",
                    value: [oKpi.valueText || oKpi.value || "", oKpi.subText || ""].filter(Boolean).join(" / ")
                };
            });
        },
        section: function (sTitle, aRows, aColumns, vOptions) {
            var oOptions = vOptions && typeof vOptions === "object" ? vOptions : { sheetName: vOptions };

            return Object.assign({
                title: sTitle,
                sheetName: oOptions.sheetName || sTitle,
                rows: aRows || [],
                columns: aColumns || []
            }, oOptions);
        },
        chart: function (sTitle, sControlId, sSourceSectionTitle, oOptions) {
            return Object.assign({
                title: sTitle,
                controlId: sControlId,
                sourceSectionTitle: sSourceSectionTitle
            }, oOptions || {});
        },
        exportExcel: function (oReport) {
            if (!hasContent(oReport || {})) {
                MessageBox.warning("내보낼 데이터가 없습니다.");
                return;
            }
            downloadBlob(new Blob([buildXlsx(oReport)], { type: MIME_XLSX }), normalizeFileName(oReport.fileName || oReport.title, "xlsx"));
        },
        printPdf: function (oReport) {
            var oWindow;

            if (!hasContent(oReport || {})) {
                MessageBox.warning("출력할 데이터가 없습니다.");
                return;
            }

            oWindow = window.open("", "", "width=1200,height=800");
            if (!oWindow) {
                MessageBox.warning("팝업 차단을 해제한 뒤 다시 시도해주세요.");
                return;
            }

            oWindow.document.open();
            oWindow.document.write(pdfHtml(oReport));
            oWindow.document.close();
            oWindow.focus();
            setTimeout(function () {
                oWindow.print();
            }, 350);
        }
    };
});
