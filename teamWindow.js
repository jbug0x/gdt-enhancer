// Team window: every employee in one table, with vacation and training for many of them at once.
// It is a normal game window (UI.showModalContent, the game's own window styles), opened from the
// "Team..." button of the progress panel. Vacation and training use the same calls as the per-employee
// context menu of the game (Character.goOnVacation, GameManager.research), just in a loop.
(function () {
	var config = GdtEnhancer.config;

	// trainings that need a context of their own (a game to patch or to write a report on, ...)
	var SKIPPED_TRAININGS = { PatchGame: true, postMortem: true, Management1: true };

	var STATUS = {
		Idle: 'Idle', Working: 'Working', Researching: 'Researching', CreateEngine: 'Building engine',
		WorkOnContract: 'On a contract', Training: 'Training', Vacation: 'On vacation'
	};

	// ---- logic (no DOM) ---------------------------------------------------------------------------------

	var isTraining = function (c) {
		return c.state === CharacterState.Training ||
			(c.state === CharacterState.Researching && !!c.currentResearch && !!c.currentResearch.isTraining);
	};

	GdtEnhancer.staffStatus = function (c) {
		return isTraining(c) ? STATUS.Training : (STATUS[c.state] || String(c.state));
	};

	GdtEnhancer.staffRows = function (company) {
		return company.staff.map(function (c) {
			var expert = '';
			if (c.flags.expert) {
				var mission = Missions.getMissionWithId(c.flags.expert);
				expert = mission ? mission.name : '';
			}
			return {
				id: c.id, name: c.name, expert: expert, level: c.getLevel(),
				design: c.getDesignSkillPoints(), tech: c.getTechnologySkillPoints(),
				speed: c.getSpeedSkillPoints(), research: c.getResearchSkillPoints(),
				efficiency: Math.round(c.efficiency * 100), salary: c.salary,
				status: GdtEnhancer.staffStatus(c), idle: c.isIdle(), tired: !!c.flags.needsVacation
			};
		});
	};

	// Trainings at least one employee could do, each once (the game lists them per employee).
	GdtEnhancer.availableTrainings = function (company) {
		var byId = {}, list = [];
		company.staff.forEach(function (c) {
			Training.getAvailableTraining(c).forEach(function (item) {
				if (!item.name || SKIPPED_TRAININGS[item.id] || byId[item.id])
					return;
				byId[item.id] = item;
				list.push(item);
			});
		});
		return list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
	};

	// Who of the chosen employees can be sent on vacation: the game only offers it to tired ones, and
	// someone in the middle of a research/training must finish it first.
	GdtEnhancer.planVacation = function (company, ids) {
		var plan = { send: [], skipped: 0 };
		company.staff.forEach(function (c) {
			if (ids.indexOf(c.id) === -1)
				return;
			var busy = c.state === CharacterState.Researching || c.state === CharacterState.Training || c.state === CharacterState.Vacation;
			if (c.flags.needsVacation && !busy)
				plan.send.push(c);
			else
				plan.skipped++;
		});
		return plan;
	};

	GdtEnhancer.applyVacation = function (plan) {
		plan.send.forEach(function (c) { c.goOnVacation(); });
	};

	// Who of the chosen employees can start a training right now, paying like the game does for each one
	// (research points and credits), in the order they are listed, until the money or points run out.
	GdtEnhancer.planTraining = function (company, item, ids) {
		var points = Research.getPointsCost(item), cost = Research.getResearchCost(item) || 0;
		var pointsLeft = company.researchPoints, cashLeft = company.cash;
		var plan = { train: [], busy: 0, notAllowed: 0, unaffordable: 0, points: 0, cost: 0 };
		company.staff.forEach(function (c) {
			if (ids.indexOf(c.id) === -1)
				return;
			if (!c.canStartResearch())
				plan.busy++;
			else if (item.canUse && !item.canUse(c, company))
				plan.notAllowed++;
			else if (points > pointsLeft || cost > cashLeft)
				plan.unaffordable++;
			else {
				pointsLeft -= points;
				cashLeft -= cost;
				plan.train.push(c);
			}
		});
		plan.points = points * plan.train.length;
		plan.cost = cost * plan.train.length;
		return plan;
	};

	GdtEnhancer.applyTraining = function (plan, item) {
		var previous = GameManager.uiSettings.selectedChar;
		try {
			plan.train.forEach(function (c) {
				GameManager.uiSettings.selectedChar = c.id;   // the game starts the training for the selected employee
				GameManager.research(item, 'training');
			});
		} finally {
			GameManager.uiSettings.selectedChar = previous;
		}
	};

	// ---- window -----------------------------------------------------------------------------------------

	var DIALOG_ID = 'gdteTeamDialog';
	var styled = false;

	var injectStyle = function () {
		if (styled)
			return;
		styled = true;
		var style = document.createElement('style');
		style.textContent =
			'#gdteTeamDialog .gdte-team{padding:0 18px;font-family:"Segoe UI","Open Sans",sans-serif;color:#212121}' +
			'#gdteTeamDialog .gdte-info{text-align:center;font-size:13pt;margin:4px 0}' +
			'#gdteTeamDialog .gdte-toolbar{margin:4px 0}' +
			'#gdteTeamDialog .gdte-chip{display:inline-block;margin-right:6px;padding:1px 10px;border:2px solid #A4A4A4;border-radius:5px;background:#fff;cursor:pointer;font-size:12pt;-webkit-user-select:none}' +
			'#gdteTeamDialog .gdte-chip:hover{background:#FFD17B}' +
			'#gdteTeamDialog .gdte-scroll{height:300px;overflow-y:auto;border:2px solid #FFD17B;background:#fff}' +
			'#gdteTeamDialog table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12pt}' +
			'#gdteTeamDialog th{background:#FFD17B;padding:3px 6px;text-align:left;font-weight:bold;white-space:nowrap}' +
			'#gdteTeamDialog td{padding:3px 6px;border-top:1px solid #eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
			'#gdteTeamDialog tr.gdte-tired td{background:#fff3cd}' +
			'#gdteTeamDialog .gdte-num{text-align:right}' +
			// the game gives every input a fixed width, which would stretch the checkboxes
			'#gdteTeamDialog input[type=checkbox]{width:auto;height:auto;margin:0;vertical-align:middle;cursor:pointer}' +
			'#gdteTeamDialog .gdte-sub{color:#777;font-size:10.5pt}' +
			'#gdteTeamDialog .gdte-actions{margin-top:8px}' +
			'#gdteTeamDialog .gdte-actions .selectorButton{display:inline-block;width:auto;height:34px;line-height:34px;margin:3px 6px 3px 0;padding:0 14px;font-size:13pt}' +
			'#gdteTeamDialog select{font-size:12pt;max-width:330px;margin-right:6px}' +
			'#gdteTeamDialog .gdte-result{margin-top:6px;min-height:1.5em;font-size:12pt}';
		document.head.appendChild(style);
	};

	var esc = function (text) { return $('<div></div>').text(String(text)).html(); };
	var money = function (n) { return UI.getShortNumberString(n); };

	GdtEnhancer.openTeamWindow = function () {
		var company = GameManager.company;
		// never on top of another window (one of the game's own, or this one)
		if (!company || UI._isModalContentOpen || $('.simplemodal-data').length)
			return;
		injectStyle();

		var selected = {};             // employee id -> true
		var trainings = [];

		var dialog = function () {
			var live = $('.simplemodal-data').filter('#' + DIALOG_ID);
			return live.length ? live : $('#' + DIALOG_ID);
		};
		var chosenIds = function () {
			return company.staff.filter(function (c) { return selected[c.id]; }).map(function (c) { return c.id; });
		};
		var chosenTraining = function () {
			var id = dialog().find('.gdte-training').val();
			return trainings.filter(function (t) { return t.id === id; })[0];
		};
		var say = function (text) { dialog().find('.gdte-result').text(text); };

		var render = function () {
			var d = dialog();
			d.find('.gdte-info').text('Research points: {0}   Cash: {1}'.localize().format(Math.floor(company.researchPoints), money(company.cash)));

			var rows = GdtEnhancer.staffRows(company);
			var html = '<table><colgroup><col width="30"><col width="175"><col width="42"><col width="44"><col width="44"><col width="40"><col width="40"><col width="52"><col width="170"><col></colgroup>' +
				'<tr><th><input type="checkbox" class="gdte-all"></th><th>' + 'Name'.localize() + '</th><th class="gdte-num">' + 'Lvl.'.localize() +
				'</th><th class="gdte-num">D</th><th class="gdte-num">T</th><th class="gdte-num">S</th><th class="gdte-num">R</th><th class="gdte-num">' + 'Eff.'.localize() +
				'</th><th>' + 'Status'.localize() + '</th><th class="gdte-num">' + 'Salary'.localize() + '</th></tr>';
			rows.forEach(function (r) {
				html += '<tr class="' + (r.tired ? 'gdte-tired' : '') + '"><td><input type="checkbox" class="gdte-pick" data-id="' + r.id + '"' + (selected[r.id] ? ' checked' : '') + '></td>' +
					'<td>' + esc(r.name) + (r.expert ? ' <span class="gdte-sub">(' + esc(r.expert) + ')</span>' : '') + '</td>' +
					'<td class="gdte-num">' + r.level + '</td><td class="gdte-num">' + r.design + '</td><td class="gdte-num">' + r.tech + '</td>' +
					'<td class="gdte-num">' + r.speed + '</td><td class="gdte-num">' + r.research + '</td><td class="gdte-num">' + r.efficiency + '%</td>' +
					'<td>' + esc(r.status.localize()) + (r.tired ? ' <span class="gdte-sub">' + esc('tired'.localize()) + '</span>' : '') + '</td>' +
					'<td class="gdte-num">' + esc(money(r.salary)) + '</td></tr>';
			});
			d.find('.gdte-scroll').html(html + '</table>');
			d.find('.gdte-all').prop('checked', rows.length > 0 && rows.every(function (r) { return selected[r.id]; }));

			var count = chosenIds().length;
			d.find('.gdte-vacation').text('Send on vacation ({0})'.localize().format(count));
			d.find('.gdte-train').text('Train ({0})'.localize().format(count));

			var keep = d.find('.gdte-training').val();
			trainings = company.currentLevel > 1 ? GdtEnhancer.availableTrainings(company) : [];
			var options = '';
			trainings.forEach(function (t) {
				var cost = Research.getResearchCost(t) || 0, points = Research.getPointsCost(t);
				options += '<option value="' + esc(t.id) + '">' + esc(t.name) + ' (' + points + ' RP' + (cost ? ', ' + money(cost) + ' cr.' : '') + ')</option>';
			});
			if (!trainings.length)
				options = '<option>' + esc('No training available'.localize()) + '</option>';
			d.find('.gdte-training').html(options);
			if (keep && trainings.some(function (t) { return t.id === keep; }))
				d.find('.gdte-training').val(keep);
		};

		var select = function (test) {
			selected = {};
			company.staff.forEach(function (c) { if (test(c)) selected[c.id] = true; });
			render();
		};

		var describeTraining = function (item, plan) {
			var text = 'Training "{0}" started for {1}.'.localize().format(item.name, plan.train.length);
			var skipped = [];
			if (plan.busy) skipped.push('{0} busy'.localize().format(plan.busy));
			if (plan.notAllowed) skipped.push('{0} not allowed'.localize().format(plan.notAllowed));
			if (plan.unaffordable) skipped.push('{0} not affordable'.localize().format(plan.unaffordable));
			if (skipped.length) text += ' ' + 'Skipped: {0}.'.localize().format(skipped.join(', '));
			if (plan.train.length) text += ' ' + 'Cost: {0} RP, {1} cr.'.localize().format(plan.points, money(plan.cost));
			return text;
		};

		// the window's own markup lives next to the game's windows, where the game keeps them hidden
		$('#' + DIALOG_ID).remove();
		$('#resources').append(
			'<div id="' + DIALOG_ID + '" class="wideWindow windowBorder"><div class="windowTitle">' + 'Team'.localize() + '</div>' +
			'<div class="gdte-team"><div class="gdte-info"></div>' +
			'<div class="gdte-toolbar"><span class="gdte-chip" data-select="all">' + 'All'.localize() + '</span>' +
			'<span class="gdte-chip" data-select="idle">' + 'Idle'.localize() + '</span>' +
			'<span class="gdte-chip" data-select="tired">' + 'Needs vacation'.localize() + '</span>' +
			'<span class="gdte-chip" data-select="none">' + 'None'.localize() + '</span></div>' +
			'<div class="gdte-scroll"></div>' +
			'<div class="gdte-actions"><span class="selectorButton greenButton gdte-vacation"></span> ' +
			'<select class="gdte-training"></select><span class="selectorButton orangeButton gdte-train"></span></div>' +
			'<div class="gdte-result"></div></div>' +
			'<div class="centeredButtonWrapper"><div class="okButton selectorButton windowMainActionButton orangeButton windowLargeOkButton">' + 'OK'.localize() + '</div></div></div>');

		// delegated, so it keeps working whichever copy of the window the modal system shows
		var click = function () { if (typeof Sound !== 'undefined' && Sound.click) Sound.click(); };
		$('body').off('.gdteTeam')
			.on('change.gdteTeam', '#' + DIALOG_ID + ' .gdte-pick', function () {
				selected[$(this).attr('data-id') * 1] = this.checked || undefined;
				render();
			})
			.on('change.gdteTeam', '#' + DIALOG_ID + ' .gdte-all', function () {
				var on = this.checked;
				select(function () { return on; });
			})
			.on('click.gdteTeam', '#' + DIALOG_ID + ' .gdte-chip', function () {
				click();
				var kind = $(this).attr('data-select');
				select(function (c) { return kind === 'all' || (kind === 'idle' && c.isIdle()) || (kind === 'tired' && !!c.flags.needsVacation); });
			})
			.on('click.gdteTeam', '#' + DIALOG_ID + ' .gdte-vacation', function () {
				click();
				var plan = GdtEnhancer.planVacation(company, chosenIds());
				GdtEnhancer.applyVacation(plan);
				render();
				say(plan.send.length
					? '{0} sent on vacation. Skipped: {1} (they do not need one, or are busy).'.localize().format(plan.send.length, plan.skipped)
					: 'Nobody to send: only tired employees can go on vacation.'.localize());
			})
			.on('click.gdteTeam', '#' + DIALOG_ID + ' .gdte-train', function () {
				click();
				var item = chosenTraining();
				if (!item) { say('Pick a training first.'.localize()); return; }
				var plan = GdtEnhancer.planTraining(company, item, chosenIds());
				GdtEnhancer.applyTraining(plan, item);
				render();
				say(describeTraining(item, plan));
			})
			.on('click.gdteTeam', '#' + DIALOG_ID + ' .okButton', function () {
				click();
				UI.closeModal();
			});

		render();
		UI.showModalContent('#' + DIALOG_ID, {
			close: true,
			disableCheckForNotifications: true,
			onClose: function () { $('body').off('.gdteTeam'); }
		});
	};
})();
