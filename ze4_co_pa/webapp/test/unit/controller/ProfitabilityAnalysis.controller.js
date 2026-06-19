/*global QUnit*/

sap.ui.define([
	"ze4/co/pa/ze4copa/controller/ProfitabilityAnalysis.controller"
], function (Controller) {
	"use strict";

	QUnit.module("ProfitabilityAnalysis Controller");

	QUnit.test("I should test the ProfitabilityAnalysis controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
