/*global QUnit*/

sap.ui.define([
	"ze4/co/s/cost/ze4coscost/controller/StandardCost.controller"
], function (Controller) {
	"use strict";

	QUnit.module("StandardCost Controller");

	QUnit.test("I should test the StandardCost controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
