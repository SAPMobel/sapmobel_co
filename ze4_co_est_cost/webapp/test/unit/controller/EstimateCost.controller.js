/*global QUnit*/

sap.ui.define([
	"ze4/co/est/cost/ze4coestcost/controller/EstimateCost.controller"
], function (Controller) {
	"use strict";

	QUnit.module("EstimateCost Controller");

	QUnit.test("I should test the EstimateCost controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
