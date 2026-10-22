# GDT Enhancer

Free, non-commercial mod for Game Dev Tycoon (full version only). Requires the official `gdt-modAPI` mod that ships with the game.

## Features
- **Percentage markers on the development stage sliders:** next to the handle of each vertical slider you see how much of the stage's time that feature really gets, always adding up to 100%.
- **"Ideal" button** in the same window: sets the three sliders to the split the game rewards most for your topic/genre, following the review rules (important missions get 40% or more, nothing important is neglected, unimportant ones are never over-focused). Note that it uses the game's hidden mission weightings; turn it off with `showIdealButton: false` if you prefer to discover them yourself.
- **Movable panels:** both panels below can be dragged by their header anywhere on the screen (they stay inside the window), clicked to collapse, and double-clicked to go back to their default place. Position and collapsed state are remembered.
- **Progress panel** (bottom left by default, click the header to collapse): a checklist of what is still missing for the next office (cash, released games, employees, date and whether you are between games, using the same conditions the game checks). Disable with `showProgressPanel: false`.
- **Team window:** the "Team..." button of the progress panel opens a window (in the game's own style) with every employee in one table: level, skills, efficiency, status and salary. Tick the ones you want (or use All / Idle / Needs vacation / None) and send all the tired ones on vacation, or start the same training for all of them at once. Vacation and training use the game's own actions (the same as the per-employee menu): only tired employees go on vacation, only idle ones can start a training, and each training is paid for every employee as usual until your research points or cash run out. Disable with `showTeamWindow: false`.
- **Top score panel** (next to the progress panel, only while a game is in development): a checklist of what the game's review rules reward for the current game: how well the topic, genre, platform and audience fit, not repeating your last game, a game size/technology level that allows a 10, enough focus on the important development areas, design/technology balance, few bugs, and experts on the important areas (needed for an 11/10). It also shows an estimate of the score if the game were released now, the quality you still need to beat your own best game, and the hidden limits that keep scores under 9 (review bonuses of at least +0.1, staff who are still "new" after fewer than about 2 games, and the early years). It reveals hidden weightings; disable with `showScorePanel: false`.
- 4 new game topics: Neon Dystopia, Pirates, Caped Heroes, Space Colony
- Optional extras, off by default: weekly cash/hype bonus, and no efficiency loss for existing staff when hiring

Values are configurable in the `config` block at the top of `main.js`.

## Contact
Author: João Gustavo "jbug" Bispo
Contact: jbug0x1b@gmail.com

This mod is distributed under the Game Dev Tycoon Modding Agreement. It contains no assets or code from the game.
