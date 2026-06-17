/*global QUnit*/

sap.ui.define([
	"ze4/co/cc/cost/ze4cocccost/controller/CostCenterCost.controller"
], function (Controller) {
	"use strict";

	QUnit.module("CostCenterCost Controller");

	QUnit.test("I should test the CostCenterCost controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
