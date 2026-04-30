# Clarity - A Dota2 stat viewer
This vite project is built with npm. It utilizes two external libraries:
- Axios: A request API
- Datastar: A framework leveraging HTML data attributes.

## How to use in current state
- Enter some account ids: 86176724 (low enough to display player rank correctly in distribution), 488933273 (immortal player showing that fetching leaderboard pos works (although placing the number alone on the emblem plaque is not implemented.)), 86776724, uncalibrated account - with a history of abandoning matches showing the different leaver statuses show up in the match history when relevant - like disconnected or afk.
- Try searching for the personaName for one of the accounts above (the database query is quite slow on the API side).
- Hover distributions to see details on player count and the respective percentile.
- Click on a match in match history to show the match view (currently under construction).

## Quickly about datastar
Where datastar really shines is when you let your backend do the data handling and the backend and frontend communicates via requests returning HTML responses. This project does not have a dynamic backend due to the nature of the assignment, but leverages datastar's reactive signaling in the frontend. Here's a short rundown for help when reading the code:
- The datastar plugin in VS code might be helpful while reading the code.
- Datastar lets you declare variables on data attributes, called _signals_. They are written as `$signalName`. Casing follows HTML specs, meaning that when you see a signal in the attribute name, it will have kebab-casing, and it is referenced with $camelCasing in _datastar expressions_, which are JS in the values of the datastar attributes, with very few caveats.
- Signals can be declared as such: `data-signals:signal-name="signal value expr."` OR `data-signals="$signalName = signal value expr."`
- Multiple signals can be declared with javascript object notation (of which JSON is a subset): `data-signals="{signalA: value, signalB: {subSignal1: value, subSignal2: value}}"`
- Signals are also automatically created on many datastar data attributes as needed.

- We can bind the value of user input elements to a signal with `data-bind:<signal>`
- We can bind the textContent of an element to a signal with `data-text="$signal"`
- We can derive new signals with `data-computed:signal="expr"`
- We can Hide or show an element with `data-show="expr that evaluates to boolean"`
- We can set classes or styling dynamically with `data-class` and `data-style`
- We can bind data attribute values to signals and expressions with `data-attr:<attribute>`
- We can attach event listeners with `data-on:<event>` etc.