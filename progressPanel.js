// Checklist panels (bottom left, click a header to collapse):
//  - Progress: what is still missing for the next office. The rules mirror
//    DecisionNotifications.moveToLevel2/3/4.
//  - Top score: how the game in development is doing against the rules Reviews.rateGame applies.
(function () {
	var config = GdtEnhancer.config;
	var CHECK = String.fromCharCode(0x2713), DOT = String.fromCharCode(0x2022), OPEN = String.fromCharCode(0x25BE);

	var money = function (n) { return UI.getShortNumberString(n); };
	var weeksToDate = function (week) {
		return 'year {0}, month {1}'.format(Math.floor(week / 48) + 1, Math.floor((week % 48) / 4) + 1);
	};
	var check = function (label, ok, detail) { return { label: label, ok: ok, detail: detail === undefined ? '' : detail }; };

	// ---- office checklist -------------------------------------------------------------------------------

	// What the game requires before it offers each office, keyed by the current office level.
	var OFFICES = {
		1: { name: 'Technology park office', cost: 150000, cash: 1e6, minGames: 1 },
		2: { name: 'Renovated office', cost: 150000, cash: 5e5, otherStaff: 1, date: '11/6/2' },
		3: { name: 'Headquarters', cost: 8e6, cash: 16e6, otherStaff: 3, date: '13/9/2' }
	};

	GdtEnhancer.getOfficeChecks = function (company) {
		var office = OFFICES[company.currentLevel];
		if (!office)
			return null;
		var checks = [];
		if (office.minGames)
			checks.push(check('Release a game', company.gameLog.length >= office.minGames, company.gameLog.length + '/' + office.minGames));
		checks.push(check('Cash', company.cash >= office.cash, money(company.cash) + '/' + money(office.cash)));
		if (office.otherStaff) {
			var others = company.staff.length - 1;
			checks.push(check('Employees besides you', others >= office.otherStaff, others + '/' + office.otherStaff));
		}
		if (office.date) {
			var week = General.getWeekFromDateString(office.date, true);
			checks.push(check('Reach ' + weeksToDate(week), company.currentWeek >= week));
		}
		checks.push(check('Between games', GameManager.isIdle()));

		var last = company.flags.lastMoveUpLevelQ;
		if (last) {
			var weeksLeft = Math.ceil((last + 2e4 * GameManager.SECONDS_PER_WEEK - GameManager.gameTime) / (GameManager.SECONDS_PER_WEEK * 1000));
			if (weeksLeft > 0)
				checks.push(check('Wait after your last answer', false, weeksLeft + ' weeks'));
		}
		return { title: office.name, cost: office.cost, checks: checks };
	};

	// ---- top score checklist ----------------------------------------------------------------------------

	// Same conversion Reviews.rateGame uses: the share of the stage's time a mission got (0..1).
	var missionShare = function (entry, game) {
		return entry.duration / General.getGameSizeDurationFactor(game.gameSize) /
			General.getMultiPlatformDurationFactor(game) / (3 * Missions.BASE_DURATION);
	};

	// Developing missions whose responsible employee is an expert in exactly that mission.
	var countExperts = function (company, game) {
		var responsibility = game.flags.featureResponsibility || {};
		return Missions.getAllMissions().filter(function (m) {
			if (m.missionType !== 'dev' || Missions.getGenreWeighting(m, game) < 0.9 || !responsibility.hasOwnProperty(m.id))
				return false;
			var staff = company.staff.first(function (s) { return s.id === responsibility[m.id]; });
			return !!staff && staff.flags.expert === m.id;
		}).length;
	};

	// Highest score the game size allows (the game multiplies the score by this / 10).
	var scoreCap = function (company, game, experts) {
		var tech = game.flags.techLevel || 0;
		if (game.gameSize === 'small')
			return company.currentLevel >= 2 ? 9 : 10;
		if (game.gameSize === 'medium')
			return company.fans <= 1e5 ? 9 : 10;
		if (game.gameSize === 'large')
			return 10 - Math.min(Math.max(3 - tech, 0), 3);
		if (game.gameSize === 'aaa')
			return 10 - (Math.min(Math.max(5 - tech, 0), 3) + 0.6 * Math.min(Math.max(3 - experts, 0), 3));
		return 10;
	};

	// How the review rules see the focus given to each development area so far.
	var focusStats = function (game) {
		var missions = (game.featureLog || []).filter(function (e) { return e.missionType === 'mission'; });
		var count = function (test) {
			return missions.filter(function (e) { return test(Missions.getGenreWeighting(e, game), missionShare(e, game)); }).length;
		};
		return {
			logged: missions.length,
			focused: count(function (w, s) { return w >= 0.9 && s >= 0.4; }),
			neglected: count(function (w, s) { return w >= 0.9 && s <= 0.2; }),
			odd: count(function (w, s) { return w < 0.8 && s >= 0.4; })
		};
	};

	// How far the design/technology points are from the genre's golden ratio, in percent (null while too early).
	var balanceDiff = function (game) {
		var d = game.designPoints, t = game.technologyPoints;
		if (d + t < 30)
			return null;
		return Math.abs((d * GameGenre.getGoldenRatio(game.genre, game.secondGenre) - t) / (t > d ? t : d) * 100);
	};

	// Difference between the best and worst console technology level (PC does not count).
	var platformSpread = function (game) {
		var tech = game.platforms.filter(function (p) { return p.id !== 'PC'; }).map(function (p) { return p.techLevel; });
		return game.platforms.length > 1 && tech.length ? Math.max.apply(null, tech) - Math.min.apply(null, tech) : 0;
	};

	// The sum of bonuses and penalties Reviews.rateGame adds up; the game multiplies the quality by (1 + it).
	var reviewBonus = function (company, game, stats, balance, repeated, combo) {
		var mmo = game.flags.mmo ? 2 : 1, s = 0;
		if (balance !== null)
			s += balance <= 25 ? 0.1 : balance > 50 ? -0.1 : 0;
		if (stats.logged > 0)
			s += stats.focused >= 2 ? 0.2 : stats.focused === 1 ? 0.1 : -0.15 * mmo;
		s -= stats.odd === 2 ? 0.2 * mmo : stats.odd === 1 ? 0.1 * mmo : 0;
		s -= 0.15 * mmo * stats.neglected;
		if (repeated)
			s -= 0.4;
		var original = game.sequelTo ? company.getGameById(game.sequelTo) : null;
		if (original && original.releaseWeek > company.currentWeek - 40)
			s -= 0.4;
		if (game.flags.usesSameEngineAsSequel && !game.flags.isExtensionPack)
			s -= 0.1;
		else if (game.flags.hasBetterEngineThanSequel)
			s += 0.2;
		if (game.flags.mmo && combo < 1)
			s -= 0.15;
		return s;
	};

	// The quality the game has to reach for a 10: your best game so far plus 10-20% (Reviews' private function).
	var targetQuality = function (company) {
		if (!company.lastTopScore)
			return 20;
		var year = company.getCurrentDate().year;
		var growth = year <= 6 ? 1.15 : year > 23 ? 1.1 : 1.2;
		var previous = company.previousTopScore ? company.previousTopScore : 20;
		var target = Math.floor(company.lastTopScore + company.lastTopScoreIncrease * growth);
		var span = 6 + 9 * General.getGameSizeDurationFactor(company.lastTopScoreGameSize);
		return !company.lastTopScoreWeek || company.currentWeek >= company.lastTopScoreWeek + span
			? target
			: Math.floor(previous + (target - previous) * (company.currentWeek - company.lastTopScoreWeek) / span);
	};

	// The score the game would get with the points it has right now (the random parts are left out).
	var estimateScore = function (company, game, parts) {
		var trend = typeof GameTrends !== 'undefined' && GameTrends.getCurrentTrendFactor ? GameTrends.getCurrentTrendFactor(game) : 1;
		var quality = (game.designPoints + game.technologyPoints) / 2 / General.getGameSizePointsFactor(game);
		quality = (quality + quality * parts.bonus) * parts.platform * parts.audience * parts.bugFactor * (1 - parts.spread / 20) * trend;
		var target = targetQuality(company);
		var z = quality / target;
		if (z >= 0.6 && (parts.audience <= 0.7 || parts.combo <= 0.7))
			z = 0.6 + (z - 0.6) / 2;
		if (z > 0.7) {
			for (var i = 0; i < game.platforms.length; i++) {
				var weighting = Platforms.getPlatformsAudienceWeighting(game.platforms[i].audienceWeightings, game.targetAudience);
				if (weighting <= 0.8) {
					quality *= Platforms.getPlatformsAudienceWeighting(game.platforms[i].audienceWeightings, game.targetAudience, true);
					z = quality / target;
					break;
				}
			}
		}
		return { quality: quality, target: target, score: Math.min(Math.max(10 * z, 1), 10) * parts.cap / 10 };
	};

	GdtEnhancer.getScoreChecks = function (company) {
		var game = company.currentGame;
		if (!game || !game.topic || !game.genre || !game.platforms || !game.platforms.length)
			return null;
		var sections = [];
		var section = function (title, checks) { if (checks.length) sections.push({ title: title, checks: checks }); };

		// choices made when the game was defined
		var choices = [];
		var combo = GameGenre.getGenreWeighting(game.topic.genreWeightings, game.genre, game.secondGenre);
		choices.push(check('Topic and genre fit', combo >= 1, combo.toFixed(1)));
		var platform = Platforms.getGenreWeighting(game.platforms, game.genre, game.secondGenre);
		choices.push(check('Platform fits the genre', platform >= 1, platform.toFixed(2)));
		var audience = General.getAudienceWeighting(game.topic.audienceWeightings, game.targetAudience);
		choices.push(check('Audience fits the topic', audience >= 1, audience.toFixed(1)));
		var previous = company.gameLog[company.gameLog.length - 1];
		var repeated = !!previous && !game.flags.isExtensionPack && previous.genre === game.genre &&
			previous.secondGenre === game.secondGenre && previous.topic === game.topic;
		choices.push(check('Not a repeat of your last game', !repeated));
		if (game.sequelTo) {
			var original = company.getGameById(game.sequelTo);
			var weeks = original ? Math.ceil(original.releaseWeek - (company.currentWeek - 40)) : 0;
			choices.push(check('Sequel not too close to the original', weeks <= 0, weeks > 0 ? weeks + ' weeks' : ''));
		}
		if (game.platforms.length > 1) {
			var tech = game.platforms.filter(function (p) { return p.id !== 'PC'; }).map(function (p) { return p.techLevel; });
			var spread = tech.length ? Math.max.apply(null, tech) - Math.min.apply(null, tech) : 0;
			choices.push(check('Platforms of similar technology', spread === 0, spread ? spread + ' levels apart' : ''));
		}
		section('Your choices', choices);

		// size and technology
		var experts = countExperts(company, game);
		var cap = scoreCap(company, game, experts);
		var techLevel = game.flags.techLevel;
		var size = [check('Game size allows a 10', cap >= 10, cap >= 10 ? '' : 'max ' + (Math.round(cap * 10) / 10))];
		if (game.gameSize === 'large' || game.gameSize === 'aaa') {
			var needed = game.gameSize === 'aaa' ? 5 : 3;
			size.push(check('Technology level', techLevel >= needed, (isNaN(techLevel) ? 0 : Math.round(techLevel * 10) / 10) + '/' + needed));
		}
		section('Size and technology', size);

		// focus given to each development area so far
		var stats = focusStats(game);
		section('Development focus', [
			check('Important areas at 40%+', stats.focused >= 2, stats.focused + '/2'),
			check('No important area under 20%', stats.neglected === 0 && stats.logged > 0, stats.neglected ? stats.neglected + ' neglected' : ''),
			check('No unimportant area over 40%', stats.odd === 0 && stats.logged > 0, stats.odd ? stats.odd + ' too high' : '')
		]);

		// quality
		var quality = [];
		var points = game.designPoints + game.technologyPoints;
		var diff = balanceDiff(game);
		quality.push(diff === null ? check('Design/tech balance', false, 'too early') : check('Design/tech balance', diff <= 25, Math.round(diff) + '% off'));
		var bugFactor = game.bugs > 0 ? 1 - 0.8 * Math.min(Math.max(100 / points * game.bugs, 0), 100) / 100 : 1;
		quality.push(check('Bugs under control', bugFactor >= 0.9, game.bugs + ' bugs'));
		section('Quality', quality);

		// experts: needed for the 11/10 (psEnabled) and, in AAA games, for the cap
		if (game.gameSize !== 'small') {
			var needExperts = game.gameSize === 'aaa' ? 3 : 2;
			section('Experts', [check('Experts on important areas', experts >= needExperts, experts + '/' + needExperts)]);
		}

		// where the game stands against the review rules, and the hidden limits that keep scores under 9
		var bonus = reviewBonus(company, game, stats, diff, repeated, combo);
		var estimate = estimateScore(company, game, {
			bonus: bonus, platform: platform, audience: audience, combo: combo, bugFactor: bugFactor,
			spread: platformSpread(game), cap: cap
		});
		var date = company.getCurrentDate();
		var newStaff = typeof Reviews !== 'undefined' && Reviews.getNewStaff ? Reviews.getNewStaff(game).length : 0;
		var early = (company.topScoreAchievements || 0) < 2 && date.year < 4;
		sections.unshift({
			title: 'Estimated score', checks: [
				check('Quality vs target', estimate.quality >= estimate.target, Math.round(estimate.quality / estimate.target * 100) + '%'),
				check('Score if released now', estimate.score >= 9, estimate.score.toFixed(1)),
				{ note: 'Counts the points earned so far, so it is only final when development ends.' }
			]
		}, {
			title: 'Hidden limits on a 9+', checks: [
				check('Review bonus (+0.1 min)', bonus >= 0.1, (bonus >= 0 ? '+' : '') + bonus.toFixed(2)),
				check('No new staff on the game', newStaff === 0, newStaff ? newStaff + ' new' : ''),
				check('Past the early years', !early, early ? 'year ' + date.year + ' of 4' : ''),
				{ note: 'Staff count as new until they have worked on about 2 games.' }
			]
		});
		return { title: 'Top score', sections: sections };
	};

	// ---- panels -----------------------------------------------------------------------------------------

	var store = GDT.getDataStore('gdt-enhancer');
	var styled = false;

	var injectStyle = function () {
		if (styled)
			return;
		styled = true;
		var style = document.createElement('style');
		style.textContent =
			'.gdte-panel{position:absolute;bottom:90px;z-index:900;width:270px;font:12pt "Segoe UI","Open Sans",sans-serif;color:#000;cursor:default}' +
			'.gdte-panel .gdte-head{background:#fff;border:2px solid #A4A4A4;border-radius:5px;padding:3px 8px;cursor:move;-webkit-user-select:none;user-select:none;display:flex;justify-content:space-between}' +
			'.gdte-panel .gdte-body{background:rgba(255,255,255,0.94);border:2px solid #A4A4A4;border-top:0;border-radius:0 0 5px 5px;padding:6px 8px;max-height:calc(100vh - 230px);overflow-y:auto}' +
			'.gdte-panel h4{margin:6px 0 3px;font-size:12pt}.gdte-panel h4:first-child{margin-top:0}' +
			'.gdte-panel .gdte-row{display:flex;line-height:1.35}' +
			'.gdte-panel .gdte-mark{width:1.2em;margin-right:6px;font-weight:bold;text-align:center;color:#c0392b}' +
			'.gdte-panel .gdte-ok .gdte-mark{color:#2a9d1f}.gdte-panel .gdte-ok{color:#555}' +
			'.gdte-panel .gdte-detail{margin-left:auto;color:#555;white-space:nowrap}' +
			'.gdte-panel .gdte-note{color:#555;font-size:10.5pt}' +
			'.gdte-panel .gdte-btn{display:inline-block;margin:0 0 6px;padding:1px 14px;border:2px solid #A4A4A4;border-radius:5px;background:#FFD17B;cursor:pointer;-webkit-user-select:none}' +
			'.gdte-panel .gdte-btn:hover{background:#FFE2A8}';
		document.head.appendChild(style);
	};

	var row = function (c) {
		if (c.note)
			return '<div class="gdte-note">' + c.note.localize() + '</div>';
		return '<div class="gdte-row' + (c.ok ? ' gdte-ok' : '') + '"><span class="gdte-mark">' + (c.ok ? CHECK : DOT) + '</span>' +
			'<span>' + c.label.localize() + '</span><span class="gdte-detail">' + c.detail + '</span></div>';
	};
	var note = function (text) { return '<div class="gdte-note">' + text.localize() + '</div>'; };
	var count = function (checks) {
		var real = checks.filter(function (c) { return !c.note; });
		return { done: real.filter(function (c) { return c.ok; }).length, total: real.length };
	};

	var panels = [];
	var PANEL_WIDTH = 270;

	// Keeps a panel reachable: it can be dragged anywhere as long as its header stays inside the window.
	GdtEnhancer.clampPanel = function (pos, size, win) {
		return {
			left: Math.min(Math.max(pos.left, 0), Math.max(win.width - size.width, 0)),
			top: Math.min(Math.max(pos.top, 0), Math.max(win.height - size.height, 0))
		};
	};

	var saveSettings = function () {
		try { DataStore.saveSettings(); } catch (err) { }
	};

	// the panel that was used last is drawn above the other
	var bringToFront = function (panel) {
		panels.forEach(function (p) { if (p.root) p.root.style.zIndex = p === panel ? 901 : 900; });
	};

	// build(company) returns { summary: 'n/m' | '', html: '...' } or null to hide the panel
	var createPanel = function (id, title, left, storeKey, build) {
		var posKey = storeKey + 'Pos';
		var panel = { root: null, open: store.settings[storeKey] !== false, custom: false, dragging: false, dragged: false };

		// moves the panel (clamped to the window) and stops anchoring it to the bottom edge
		panel.place = function (x, y) {
			var head = panel.root.querySelector('.gdte-head');
			var p = GdtEnhancer.clampPanel({ left: x, top: y }, { width: PANEL_WIDTH, height: head ? head.offsetHeight : 30 },
				{ width: window.innerWidth, height: window.innerHeight });
			panel.root.style.left = p.left + 'px';
			panel.root.style.top = p.top + 'px';
			panel.root.style.bottom = 'auto';
			panel.custom = true;
		};
		// a moved panel scrolls inside the space left below it
		panel.fit = function () {
			var body = panel.root.querySelector('.gdte-body'), head = panel.root.querySelector('.gdte-head');
			if (body && head && panel.custom)
				body.style.maxHeight = Math.max(window.innerHeight - panel.root.offsetTop - head.offsetHeight - 12, 80) + 'px';
		};
		panel.reset = function () {
			delete store.settings[posKey];
			saveSettings();
			panel.custom = false;
			panel.root.style.left = left + 'px';
			panel.root.style.top = '';
			panel.root.style.bottom = '';
			panel.render();
		};

		panel.render = function () {
			if (!panel.root || panel.dragging)
				return;
			var company = GameManager.company;
			var built = company ? build(company) : null;
			if (!built) {
				panel.root.style.display = 'none';
				return;
			}
			panel.root.style.display = '';
			var oldBody = panel.root.querySelector('.gdte-body');
			var scrolled = oldBody ? oldBody.scrollTop : 0;
			var hint = 'Drag to move, click to collapse, double-click to reset the position'.localize();
			var html = '<div class="gdte-head" title="' + hint + '"><span>' + title.localize() + '</span><span>' + (panel.open ? OPEN : built.summary) + '</span></div>';
			if (panel.open)
				html += '<div class="gdte-body">' + built.html + '</div>';
			panel.root.innerHTML = html;
			var body = panel.root.querySelector('.gdte-body');
			if (body && scrolled)
				body.scrollTop = scrolled;
			panel.fit();
		};
		panel.ensure = function () {
			if (panel.root)
				return;
			injectStyle();
			panel.root = document.createElement('div');
			panel.root.id = id;
			panel.root.className = 'gdte-panel';
			panel.root.style.left = left + 'px';
			// the game runs on an old Chromium (30) without Element.closest, so walk up the tree by hand
			var inside = function (e, className) {
				for (var node = e.target; node && node !== panel.root; node = node.parentNode) {
					if (node.className && String(node.className).split(' ').indexOf(className) !== -1)
						return true;
				}
				return false;
			};
			var onHeader = function (e) { return inside(e, 'gdte-head'); };

			// click on the header collapses/expands; dragging it (more than a few pixels) moves the panel
			panel.root.addEventListener('click', function (e) {
				if (inside(e, 'gdte-btn')) {
					if (GdtEnhancer.openTeamWindow)
						GdtEnhancer.openTeamWindow();
					return;
				}
				if (!onHeader(e) || panel.dragged)
					return;
				panel.open = !panel.open;
				store.settings[storeKey] = panel.open;
				saveSettings();
				panel.render();
			});
			panel.root.addEventListener('dblclick', function (e) {
				if (onHeader(e))
					panel.reset();
			});
			panel.root.addEventListener('mousedown', function (e) {
				if (!onHeader(e) || e.button !== 0)
					return;
				e.preventDefault();
				bringToFront(panel);
				var startX = e.clientX, startY = e.clientY, originLeft = panel.root.offsetLeft, originTop = panel.root.offsetTop;
				var move = function (ev) {
					if (!panel.dragging && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5)
						return;
					panel.dragging = true;
					panel.place(originLeft + ev.clientX - startX, originTop + ev.clientY - startY);
					panel.fit();
				};
				var up = function () {
					document.removeEventListener('mousemove', move);
					document.removeEventListener('mouseup', up);
					if (!panel.dragging)
						return;
					panel.dragging = false;
					panel.dragged = true;           // swallows the click that follows the mouse up
					setTimeout(function () { panel.dragged = false; }, 0);
					store.settings[posKey] = { left: panel.root.offsetLeft, top: panel.root.offsetTop };
					saveSettings();
					panel.render();
				};
				document.addEventListener('mousemove', move);
				document.addEventListener('mouseup', up);
			});
			document.body.appendChild(panel.root);

			var saved = store.settings[posKey];
			if (saved && typeof saved.left === 'number' && typeof saved.top === 'number')
				panel.place(saved.left, saved.top);
		};
		panels.push(panel);
		return panel;
	};

	var progress = createPanel('gdte-progress', 'Progress', 10, 'progressOpen', function (company) {
		var office = GdtEnhancer.getOfficeChecks(company);
		var html = config.showTeamWindow && GdtEnhancer.openTeamWindow
			? '<div class="gdte-btn">' + 'Team...'.localize() + '</div>' : '';
		if (office) {
			html += '<h4>' + office.title.localize() + '</h4>' + office.checks.map(row).join('') +
				'<div class="gdte-note">' + 'Cost: {0}'.localize().format(money(office.cost)) + '</div>';
		} else {
			html += '<h4>' + 'Office'.localize() + '</h4>' + note('You are in the biggest office.');
		}
		var c = office ? count(office.checks) : null;
		return { summary: c ? c.done + '/' + c.total : CHECK, html: html };
	});

	var score = createPanel('gdte-score', 'Top score', 290, 'scoreOpen', function (company) {
		var result = GdtEnhancer.getScoreChecks(company);
		if (!result)
			return null;
		var all = [], html = '';
		result.sections.forEach(function (s) {
			html += '<h4>' + s.title.localize() + '</h4>' + s.checks.map(row).join('');
			all = all.concat(s.checks);
		});
		var c = count(all);
		return { summary: c.done + '/' + c.total, html: html };
	});

	var refresh = function () {
		try {
			panels.forEach(function (p) {
				if (p === score && !config.showScorePanel)
					return;
				p.ensure();
				p.render();
			});
		} catch (err) {
			Logger.LogWarning('gdt-enhancer panels failed', err);
		}
	};
	GdtEnhancer.renderProgress = refresh;

	// a smaller window must not leave a moved panel outside of it
	window.addEventListener('resize', function () {
		panels.forEach(function (p) {
			if (p.root && p.custom) {
				p.place(p.root.offsetLeft, p.root.offsetTop);
				p.fit();
			}
		});
	});

	GDT.on(GDT.eventKeys.saves.loaded, refresh);
	GDT.on(GDT.eventKeys.saves.newGame, refresh);
	GDT.on(GDT.eventKeys.gameplay.weekProceeded, refresh);
	GDT.on(GDT.eventKeys.gameplay.staffHired, refresh);
	GDT.on(GDT.eventKeys.gameplay.staffFired, refresh);
	// cash and points change all the time; a light refresh keeps the numbers current while a panel is open
	setInterval(function () {
		if (GameManager.company && panels.some(function (p) { return p.root && p.open; }))
			refresh();
	}, 2000);
})();
