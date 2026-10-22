var GdtEnhancer = {};
(function () {
	// Edit these values to tune the mod. Set a feature to 0 / false to turn it off.
	var config = {
		// Development stage window: show next to every vertical slider how much of the stage's
		// time it really gets (the game gives each slider 10% plus a share of the other 70%).
		showFocusPercent: true,
		// Adds an "Ideal" button to that window which sets the sliders to the split the game rewards
		// most for the chosen topic/genre (it reveals the hidden mission weightings).
		showIdealButton: true,

		// Collapsible checklist (bottom left) of what is still missing for the next office.
		showProgressPanel: true,
		// "Team..." window (opened from the progress panel): all employees in one table with vacation and
		// training for several of them at once.
		showTeamWindow: true,
		// Second panel, shown while a game is in development: a checklist of what the review rules reward
		// (it reveals hidden weightings such as how well the topic, genre, platform and audience fit).
		showScorePanel: true,

		// Optional extras, off by default to keep the game realistic.
		weeklyCashBonus: 0,
		weeklyHypeBonus: 0,
		cancelNewHirePenalty: false,    // the game lowers existing staff efficiency by 0.4 per hire; this undoes it
		addExtraTopics: true
	};
	GdtEnhancer.config = config;

	var onWeek = function (e) {
		try {
			var company = e.company;
			if (config.weeklyCashBonus)
				company.adjustCash(config.weeklyCashBonus, 'GDT Enhancer');
			if (config.weeklyHypeBonus)
				company.adjustHype(config.weeklyHypeBonus);
		} catch (err) {
			Logger.LogWarning('gdt-enhancer weekly update failed', err);
		}
	};

	var onHire = function (e) {
		try {
			if (!config.cancelNewHirePenalty)
				return;
			GameManager.company.staff.forEach(function (s) {
				if (s !== e.character)
					s.adjustEfficiency(0.4);
			});
		} catch (err) {
			Logger.LogWarning('gdt-enhancer hire fix failed', err);
		}
	};

	// genreWeightings: 6 values (0..1), audienceWeightings: 3 values (0..1)
	var addTopics = function () {
		GDT.addTopics([
			{ id: 'GdtE-Neon Dystopia', name: 'Neon Dystopia'.localize('game topic'), genreWeightings: [1, 0.8, 0.7, 0.6, 1, 0.8], audienceWeightings: [0.6, 0.9, 1] },
			{ id: 'GdtE-Pirates', name: 'Pirates'.localize('game topic'), genreWeightings: [1, 0.7, 0.9, 0.6, 0.8, 1], audienceWeightings: [1, 0.9, 0.7] },
			{ id: 'GdtE-Caped Heroes', name: 'Caped Heroes'.localize('game topic'), genreWeightings: [1, 0.8, 0.8, 0.6, 0.7, 0.9], audienceWeightings: [1, 1, 0.8] },
			{ id: 'GdtE-Space Colony', name: 'Space Colony'.localize('game topic'), genreWeightings: [0.7, 1, 0.8, 0.7, 1, 1], audienceWeightings: [0.8, 1, 0.9] }
		]);
	};

	// Rounds so that the shown percentages always add up to exactly 100 (largest remainder).
	GdtEnhancer.roundPercentages = function (values) {
		var floors = values.map(function (v) { return Math.floor(v); });
		var left = 100 - floors.reduce(function (a, b) { return a + b; }, 0);
		values.map(function (v, i) { return { i: i, r: v - floors[i] }; })
			.sort(function (a, b) { return b.r - a.r; })
			.slice(0, Math.max(0, left))
			.forEach(function (x) { floors[x.i]++; });
		return floors;
	};

	// What the game does with the three slider values (0..100): every mission gets 10% plus a share of 70%.
	GdtEnhancer.percentsFromSliders = function (x) {
		var sum = x.reduce(function (a, b) { return a + b; }, 0);
		return sum === 0 ? [100 / 3, 100 / 3, 100 / 3] : x.map(function (v) { return v / (sum / 70) + 10; });
	};

	// Review rules (Reviews.rateGame): a mission with weighting >= 0.9 that gets 40% or more of the stage
	// is rewarded, one with <= 20% is punished; a mission with weighting < 0.8 at 40% or more is punished.
	// weights: the 3 mission weightings of the stage. Returns the wanted percentage for each mission.
	GdtEnhancer.idealPercentages = function (weights) {
		var important = [];
		weights.forEach(function (w, i) { if (w >= 0.9) important.push(i); });
		important.sort(function (a, b) { return weights[b] - weights[a] || a - b; });
		var p = [10, 10, 10];
		var share = function (indexes, total) {
			var sum = indexes.reduce(function (a, i) { return a + weights[i]; }, 0);
			indexes.forEach(function (i) { p[i] = total * weights[i] / sum; });
		};
		var others = function () { return [0, 1, 2].filter(function (i) { return important.indexOf(i) === -1; }); };
		if (important.length === 0) {
			share([0, 1, 2], 100);
		} else if (important.length === 1) {
			p[important[0]] = 60;
			share(others(), 40);
		} else if (important.length === 2) {
			var tie = weights[important[0]] === weights[important[1]];
			p[important[0]] = tie ? 45 : 49;
			p[important[1]] = tie ? 45 : 41;
			others().forEach(function (i) { p[i] = 10; });
		} else {
			// three important missions: only one can reach 40% without pushing another under 20%
			p[important[0]] = 41;
			p[important[1]] = 30;
			p[important[2]] = 29;
		}
		return p;
	};

	// Slider values (integers 0..100) that make the game produce the wanted percentages.
	GdtEnhancer.slidersForPercentages = function (p) {
		var top = Math.max.apply(null, p) - 10;
		var x = p.map(function (v) { return top <= 0 ? 0 : Math.round((v - 10) / top * 100); });
		// integer rounding can drop a rewarded mission just under 40%: nudge it up
		for (var guard = 0; guard < 100; guard++) {
			var got = GdtEnhancer.percentsFromSliders(x);
			var low = -1;
			for (var i = 0; i < 3; i++) {
				if (p[i] >= 40 && got[i] < 40.5 && x[i] < 100) { low = i; break; }
			}
			if (low === -1)
				break;
			x[low]++;
		}
		return x;
	};

	var applyIdealSliders = function () {
		try {
			var game = GameManager.company.currentGame;
			var weights = UI.selectedFeatures.map(function (m) { return Missions.getGenreWeighting(m, game); });
			var values = GdtEnhancer.slidersForPercentages(GdtEnhancer.idealPercentages(weights));
			$('.simplemodal-data .focusSlider').each(function (i, el) {
				var slider = $(el);
				// same two steps a mouse drag does: the game's own slide callback, then moving the handle
				slider.slider('option', 'slide').call(el, {}, { value: values[i] });
				slider.slider('value', values[i]);
			});
			if (typeof Sound !== 'undefined' && Sound.click)
				Sound.click();
		} catch (err) {
			Logger.LogWarning('gdt-enhancer ideal button failed', err);
		}
	};

	var ensureIdealButton = function () {
		var container = $('.simplemodal-data .focusSliderContainer');
		if (!container.length || container.find('.gdte-ideal').length)
			return;
		$('<div class="gdte-ideal selectorButton greenButton"></div>')
			.text('Ideal'.localize('button, sets the development sliders to the best split'))
			.attr('title', 'Set the sliders to the split this topic/genre rewards most'.localize())
			.on('click', applyIdealSliders)
			.appendTo(container);
	};

	var injectFocusStyle = function () {
		if (document.getElementById('gdte-focus-style'))
			return;
		var style = document.createElement('style');
		style.id = 'gdte-focus-style';
		style.textContent =
			'.focusSlider .gdte-pct{position:absolute;left:62px;margin-bottom:-0.6em;' +
			'padding:0 6px;border-radius:4px;border:2px solid #fff;background:rgba(0,0,0,0.75);color:#fff;' +
			'font-size:14pt;font-weight:bold;line-height:1.3;white-space:nowrap;pointer-events:none;z-index:3}' +
			'.focusSliderContainer .gdte-ideal{position:absolute;top:-52px;right:10px;width:110px;height:36px;margin:0;line-height:36px;font-size:14pt;z-index:5}' +
			'.feature1 .gdte-pct{border-color:#F66}.feature2 .gdte-pct{border-color:#6F6}.feature3 .gdte-pct{border-color:#66F}';
		document.head.appendChild(style);
	};

	var updateFocusMarkers = function () {
		try {
			var wrappers = $('.simplemodal-data .focusSliderWrapper');
			if (!wrappers.length)
				return;
			injectFocusStyle();
			if (config.showIdealButton)
				ensureIdealButton();
			var percents = GdtEnhancer.roundPercentages(UI._getSelectedFeaturePercentages());
			var raw = UI._getSelectedSliderValues();
			wrappers.each(function (i, el) {
				var slider = $(el).find('.focusSlider');
				var marker = slider.find('.gdte-pct');
				if (!marker.length)
					marker = $('<div class="gdte-pct"></div>').appendTo(slider);
				marker.text(percents[i] + '%').css('bottom', raw[i] + '%');
			});
		} catch (err) {
			Logger.LogWarning('gdt-enhancer focus markers failed', err);
		}
	};

	if (config.showFocusPercent) {
		var origPreview = UI._updateFeatureFocusPreview;
		UI._updateFeatureFocusPreview = function () {
			var result = origPreview.apply(this, arguments);
			updateFocusMarkers();
			return result;
		};
	}

	GDT.on(GDT.eventKeys.gameplay.weekProceeded, onWeek);
	GDT.on(GDT.eventKeys.gameplay.staffHired, onHire);
	if (config.addExtraTopics)
		addTopics();

	// the panels and the team window live in their own files (loaded the same way the modAPI loads its parts)
	GdtEnhancer.path = GDT.getRelativePath();
	var loadPart = function (file) {
		GDT.loadJs([GdtEnhancer.path + '/' + file], function () { }, function () {
			Logger.LogWarning('gdt-enhancer could not load ' + file);
		});
	};
	if (config.showTeamWindow)
		loadPart('teamWindow.js');
	if (config.showProgressPanel)
		loadPart('progressPanel.js');
})();
