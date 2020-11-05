const GoogleSheetsHelper = require('../helpers/google-sheets.js');

const OrParser = require('../parser/or-parser.js');
const OptionalParser = require('../parser/optional-parser.js');
const AnyOrderParser = require('../parser/any-order-parser.js');

const TowerUpgradeParser = require('../parser/tower-upgrade-parser.js');
const TowerPathParser = require('../parser/tower-path-parser')
const TowerParser = require('../parser/tower-parser')
const HeroParser = require('../parser/hero-parser.js');

const MapParser = require('../parser/map-parser.js');
const PersonParser = require('../parser/person-parser')

const NaturalNumberParser = require('../parser/natural-number-parser.js');
const VersionParser = require('../parser/version-parser')

const UserCommandError = require('../exceptions/user-command-error.js');

HEAVY_CHECK_MARK = String.fromCharCode(10004) + String.fromCharCode(65039);
WHITE_HEAVY_CHECK_MARK = String.fromCharCode(9989);

const OG_COLS = {
    NUMBER: 'B',
    TOWER_1: 'C',
    TOWER_2: 'E',
    UPGRADES: 'G',
    MAP: 'I',
    VERSION: 'K',
    DATE: 'L',
    PERSON: 'M',
    LINK: 'O',
    CURRENT: 'P',
};

const ALT_COLS = {
    NUMBER: 'R',
    MAP: 'S',
    PERSON: 'U',
    LINK: 'W',
};

module.exports = {
    name: '2tc',
    execute,
    helpMessage,
    errorMessage,
    dependencies: ['btd6index']
};

async function execute(message, args) {
    if (args.length == 0 || (args.length == 1 && args[0] == 'help')) {
        return module.exports.helpMessage(message);
    }

    towerOrHeroParser = new OrParser(
        new HeroParser(),
        new TowerParser(),
        new TowerPathParser(),
        new TowerUpgradeParser(),
    )

    parsers = [
        new OptionalParser(
            new MapParser()
        ),
        new OptionalParser(
            new OrParser(
                towerOrHeroParser, // 1 tower
                [ // 2 towers
                    towerOrHeroParser,
                    towerOrHeroParser
                ],
                new NaturalNumberParser() // combo #
            ),
        ),
        new OptionalParser(
            new PersonParser()
        ),
        new OptionalParser(
            new VersionParser()
        )
    ];

    const parsed = CommandParser.parse(
        args,
        new AnyOrderParser(...parsers)
    );

    if (parsed.hasErrors()) {
        return module.exports.errorMessage(message, parsed.parsingErrors);
    }

    allCombos = await scrapeAllCombos();
    
    filteredCombos = filterCombos(allCombos, parsed);

    displayCombos(message, filteredCombos, parsed);
}

function displayCombos(message, combos, parsed) {
    console.log(combos);

    if (combos.length == 0) {
        return message.channel.send('No combos')
    }

    let challengeEmbed = new Discord.MessageEmbed()
            .setTitle(embedTitle(parsed, combos[0]))
            .setColor(colours['cyber'])

    if (combos.length == 1) {
        combo = combos[0]
        if (combo.OG) {
            return message.channel.send('1 OG combo')
        } else {
            return message.channel.send('1 ALT combo')
        }
    } else {
        return message.channel.send('more than 1 combo')
    }
}

// include sampleCombo for the correct capitalization and punctuation
function embedTitle(parsed, sampleCombo) {
    towers = parsedProvidedTowers(parsed)

    title = ""
    if (parsed.natural_number) title += `${sampleCombo.NUMBER} 2TC `
    else title += 'All 2TCs '
    if (parsed.person) title += `by ${sampleCombo.PERSON} `
    if (parsed.map) `on ${sampleCombo.MAP} `
    if (towers.length > 0) {
        towers.forEach(tower => {
            title += 'with '
            if (Aliases.isTower(tower)) {
                title += `${tower} `
            } else if (Aliases.isTowerPath(tower)) {
                towerName, path = tower.split('#')
                title += `${path.split('-').join(' ')} ${towerName} `
            } else if(Aliases.isTowerUpgrade(tower)) {
                title += `${Aliases.towerUpgradeToIndexNormalForm(tower)} `
            } else if (Aliases.isHero(tower)) {
                title += `${tower} `
            } else {
                throw `tower ${tower} is not within allotted tower/hero category. Failed to build 2TC embed title`
            }
        })
    }
}

function filterCombos(filteredCombos, parsed) {
    if (parsed.natural_number) { 
        // Filter by combo # provided
        filteredCombos = [filteredCombos[parsed.natural_number - 1]] // Wrap single combo object in an array for consistency
    } else if (parsed.hero || parsed.tower_upgrade || parsed.tower || parsed.tower_path) {
        // Filter by towers/heroes provided
        if (parsed.heroes && parsed.heroes.length > 1) {
            return message.channel.send(`Combo cannot have more than 1 hero (${parsed.heroes.join(" + ")})`)
        }

        providedTowers = parsedProvidedTowers(parsed)
        
        filteredCombos = filteredCombos.filter(combo => {
            towerNum = towerMatch(combo, providedTowers[0])
            if (!providedTowers[1]) return towerNum != 0 // If only 1 tower-query, return true for the combo if there was a tower match

            otherTowerNum = towerMatch(combo, providedTowers[1])
            return towerNum + otherTowerNum == 3 // Ensure that one tower matched to tower 1, other matched to tower 2
            // Note that failed matches return 0
        })
    }

    if (parsed.version) {
        filteredCombos = filteredCombos.filter(combo => {
            if (parsed.version.includes('.')) {
                return parsed.version == combo.VERSION
            } else {
                return parsed.version == combo.VERSION || combo.VERSION.includes(`${parsed.version}.`)
            }
        })
    }

    if (parsed.person) {
        function personFilter(map, completion) {
            return completion.PERSON.toLowerCase() == parsed.person
        };
        filteredCombos = filterByCompletion(personFilter, filteredCombos)
    }

    if (parsed.map) {
        function mapFilter(map, completion) {
            return Aliases.toAliasNormalForm(map) == parsed.map
        }
        filteredCombos = filterByCompletion(mapFilter, filteredCombos)
    }

    // Unless searching by map or person, the command user wants OG completions and not alt map spam
    if (!parsed.person && !parsed.map) { 
        function ogFilter(map, completion) {
            return completion.OG
        }
        filteredCombos = filterByCompletion(ogFilter, filteredCombos)
    }
    return filteredCombos;
}

function parsedProvidedTowers(parsed) {
    return [].concat(parsed.tower_upgrades)
                .concat(parsed.tower_paths)
                .concat(parsed.towers)
                .concat(parsed.heroes)
                .filter(el => el) // Remove null items
}

function filterByCompletion(filter, combos) {
    for (var i = combos.length - 1; i >= 0; i--) {
        combos[i].MAPS = Object.keys(combos[i].MAPS)
            .filter(map => filter(map, combos[i].MAPS[map]))
            .reduce((completion, map) => {
                completion[map] = combos[i].MAPS[map];
                return completion;
            }, {});

        if (Object.keys(combos[i].MAPS).length === 0) combos.splice(i, 1)
    }
    return combos;
}

function towerMatch(combo, tower) {
    comboTowers = [combo.TOWER_1, combo.TOWER_2]
    if (Aliases.isTower(tower)) {
        return comboTowers.map(t => {
            towerUpgrade = Aliases.toAliasNormalForm(t.NAME)
            return Aliases.towerUpgradeToTower(towerUpgrade)
        }).indexOf(tower) + 1
    } else if(Aliases.isTowerUpgrade(tower)) {
        return comboTowers.map(t => {
            towerUpgrade = Aliases.toAliasNormalForm(t.NAME)
            return Aliases.getCanonicalForm(towerUpgrade)
        }).indexOf(tower) + 1
    } else if (Aliases.isHero(tower)) {
        return comboTowers.map(t => {
            return t.NAME.toLowerCase()
        }).indexOf(tower) + 1
    } else if (Aliases.isTowerPath(tower)) {
        return comboTowers.map(t => {
            upgradeArray = t.UPGRADE.split('-').map(u => parseInt(u))
            pathIndex = upgradeArray.indexOf(Math.max(...upgradeArray))
            path = pathIndex == 0 ? "top" : pathIndex == 1 ? "middle" : "bottom"
            
            towerUpgrade = Aliases.toAliasNormalForm(t.NAME)
            towerBase = Aliases.towerUpgradeToTower(towerUpgrade)
            return `${towerBase}#${path}-path`
        }).indexOf(tower) + 1
    } else {
        throw `Somehow received tower that is not in any of [tower, tower_upgrade, tower_path, hero]`
    }
}

function helpMessage(message) {
    let helpEmbed = new Discord.MessageEmbed()
        .setTitle('`q!2tc` HELP')

    return message.channel.send(helpEmbed);
}

function errorMessage(message, parsingErrors) {
    let errorEmbed = new Discord.MessageEmbed()
        .setTitle('ERROR')
        .addField(
            'Likely Cause(s)',
            parsingErrors.map((msg) => ` • ${msg}`).join('\n')
        )
        .addField('Type `q!2tc` for help', '\u200b')
        .setColor(colours['orange']);

    return message.channel.send(errorEmbed);
}

function sheet2TC() {
    return GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');
}

async function scrapeAllCombos() {
    ogCombos = await scrapeAllOGCombos()
    altCombos = await scrapeAllAltCombos()
    return mergeCombos(ogCombos, altCombos)
}

function mergeCombos(ogCombos, altCombos) {
    mergedCombos = []

    for (var i = 0; i < ogCombos.length; i++) {
        toBeMergedOgCombo = ogCombos[i]

        map = toBeMergedOgCombo.MAP
        delete toBeMergedOgCombo.MAP // Incorporated as key of outer Object within array index

        person = toBeMergedOgCombo.PERSON
        delete toBeMergedOgCombo.PERSON // Incorporated as key-value pair in comboObject

        link = toBeMergedOgCombo.LINK
        delete toBeMergedOgCombo.LINK // Incorporated as key-value pair in comboObject

        comboObject = {
            ...toBeMergedOgCombo,
            MAPS: {},
        }
        comboObject.MAPS[map] = {
            PERSON: person,
            LINK: link,
            OG: true
        }

        mergedCombos.push(
            comboObject
        )
    }

    for (var i = 0; i < altCombos.length; i++) {
        toBeMergedAltCombo = altCombos[i]

        n = h.fromOrdinalSuffix(toBeMergedAltCombo.NUMBER)
        delete toBeMergedAltCombo.NUMBER

        map = toBeMergedAltCombo.MAP
        delete toBeMergedAltCombo.MAP

        mergedCombos[n - 1].MAPS[map] = {
            ...toBeMergedAltCombo,
            OG: false
        }
    }

    return mergedCombos
}

async function scrapeAllOGCombos() {
    sheet = sheet2TC();
    nCombos = await numCombos();
    rOffset = await findOGRowOffset();

    ogCombos = []

    await sheet.loadCells(`${OG_COLS.NUMBER}${rOffset + 1}:${OG_COLS.CURRENT}${rOffset + nCombos}`);

    for (var n = 1; n <= nCombos; n++) {
        row = rOffset + n

        ogCombos.push(
            await getOG2TCFromPreloadedRow(row)
        )
    }

    return ogCombos;
}

async function scrapeAllAltCombos() {
    sheet = sheet2TC();
    rOffset = await findOGRowOffset();

    await sheet.loadCells(
        `${ALT_COLS.NUMBER}${rOffset + 1}:${ALT_COLS.LINK}${sheet.rowCount}`
    );

    altCombos = []

    for (var row = rOffset + 1; row <= sheet.rowCount; row++) {
        if (await hasGonePastLastAlt2TCCombo(row)) break;

        altCombos.push(
            await getAlt2TCFromPreloadedRow(row)
        )
    }

    return altCombos;
}

async function numCombos() {
    const sheet = sheet2TC()
    await sheet.loadCells(`J6`);
    return sheet.getCellByA1('J6').value;
}

////////////////////////////////////////////////////////////
// OG Combos
////////////////////////////////////////////////////////////

async function getOG2TCFromPreloadedRow(row) {
    const sheet = sheet2TC();

    // Assign each value to be discord-embedded in a simple default way
    let values = {};
    for (key in OG_COLS) {
        values[key] = sheet.getCellByA1(`${OG_COLS[key]}${row}`).value;
    }

    const upgrades = values.UPGRADES.split('|').map((u) =>
        u.replace(/^\s+|\s+$/g, '')
    );
    for (var i = 0; i < upgrades.length; i++) {
        // Display upgrade next to tower
        values[`TOWER_${i + 1}`] = { 
            NAME: values[`TOWER_${i + 1}`],
            UPGRADE: upgrades[i],
        }
    }
    delete values.UPGRADES; // Don't display upgrades on their own, display with towers

    // Recapture date to format properly
    values.DATE = sheet.getCellByA1(`${OG_COLS.DATE}${row}`).formattedValue;

    // Recapture link to format properly
    const linkCell = sheet.getCellByA1(`${OG_COLS.LINK}${row}`);
    values.LINK = `[${linkCell.value}](${linkCell.hyperlink})`;

    // Replace checkmark that doesn't display in embedded with one that does
    if (values.CURRENT === HEAVY_CHECK_MARK) {
        values.CURRENT = WHITE_HEAVY_CHECK_MARK;
    }

    return values;
}

async function findOGRowOffset() {
    const sheet = GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');

    const MIN_OFFSET = 1;
    const MAX_OFFSET = 20;

    await sheet.loadCells(
        `${OG_COLS.NUMBER}${MIN_OFFSET}:${OG_COLS.NUMBER}${MAX_OFFSET}`
    );

    for (var row = MIN_OFFSET; row <= MAX_OFFSET; row++) {
        cellValue = sheet.getCellByA1(`B${row}`).value;
        if (cellValue) {
            if (cellValue.toLowerCase().includes('number')) {
                return row;
            }
        }
    }

    throw `Cannot find 2TC header "Number" to orient combo searching`;
}

////////////////////////////////////////////////////////////
// Alt Combos
////////////////////////////////////////////////////////////

async function getAlt2TCFromPreloadedRow(row) {
    const sheet = GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');

    // Assign each value to be discord-embedded in a simple default way
    let values = {};
    for (key in ALT_COLS) {
        values[key] = sheet.getCellByA1(`${ALT_COLS[key]}${row}`).value;
    }

    // Format link properly
    const linkCell = sheet.getCellByA1(`${ALT_COLS.LINK}${row}`);
    values.LINK = `[${linkCell.value}](${linkCell.hyperlink})`;

    while (!values.NUMBER) {
        values.NUMBER = sheet.getCellByA1(`${ALT_COLS.NUMBER}${--row}`).value;
    }

    return values;
}

async function hasGonePastLastAlt2TCCombo(row) {
    const sheet = GoogleSheetsHelper.sheetByName(Btd6Index, '2tc');

    return !sheet.getCellByA1(`${ALT_COLS.PERSON}${row}`).value;
}