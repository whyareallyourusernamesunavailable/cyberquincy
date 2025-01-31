const AnyOrderParser = require('../parser/any-order-parser.js');
const OptionalParser = require('../parser/optional-parser.js');

const HeroParser = require('../parser/hero-parser.js');
const RoundParser = require('../parser/round-parser');
const MapDifficultyParser = require('../parser/map-difficulty-parser.js');

const ReactionChain = require('../helpers/reactor/reaction_chain');
const SingleTextParser = require('../helpers/reactor/single_text_parser');
const MenuReactor = require('../helpers/reactor/menu_reactor');

const {
    MessageSelectMenu,
    MessageEmbed,
    MessageActionRow,
} = require('discord.js');

const Heroes = require('../helpers/heroes');

const gHelper = require('../helpers/general.js');

const mapDifficultyMenu = new MessageSelectMenu()
    .setCustomId('map_difficulty')
    .setPlaceholder('Nothing selected')
    .addOptions([
        {
            label: 'Beginner',
            description: '1x levelling',
            value: 'beginner',
        },
        {
            label: 'Intermediate',
            description: '1.1x levelling',
            value: 'intermediate',
        },
        {
            label: 'Advanced',
            description: '1.2x levelling',
            value: 'advanced',
        },
        {
            label: 'Expert',
            description: '1.3x levelling',
            value: 'expert',
        },
    ]);

const heroMenu = new MessageSelectMenu()
    .setCustomId('hero')
    .setPlaceholder('Nothing selected')
    .addOptions([
        {
            label: 'Adora',
            description: 'High priestess',
            value: 'adora',
        },
        {
            label: 'Benjamin',
            description: 'Code Monkey',
            value: 'benjamin',
        },
        {
            label: 'Admiral Brickell',
            description: 'Naval Commander',
            value: 'brickell',
        },
        {
            label: 'Captain Churchill',
            description: 'Tank',
            value: 'churchill',
        },
        {
            label: 'Etienne',
            description: 'Drone Operator',
            value: 'etienne',
        },
        {
            label: 'Ezili',
            description: 'Voodoo Monkey',
            value: 'ezili',
        },
        {
            label: 'Gwendolin',
            description: 'Pyromaniac',
            value: 'gwen',
        },
        {
            label: 'Strike Jones',
            description: 'Artillery Commander',
            value: 'jones',
        },
        {
            label: 'Obyn',
            description: 'Forest Guardian',
            value: 'obyn',
        },
        {
            label: 'Pat Fusty',
            description: 'Giant Monkey',
            value: 'pat',
        },
        {
            label: 'Psi',
            description: 'Psionic Monkey',
            value: 'psi',
        },
        {
            label: 'Quincy',
            description: 'me',
            value: 'quincy',
        },
        {
            label: 'Sauda',
            description: 'Swordmaster',
            value: 'sauda',
        },
    ]);

function execute(message, args) {
    if (args.length == 1 && args[0] == 'help') {
        return message.channel.send(
            'Type `q!herolevelenergizer` and follow the instructions (you may also want to try `q!herolevel` or `q!herolevelby`)'
        );
    }

    const parsed = CommandParser.parse(
        args,

        // Make any of the available arguments optional to add in any order in the command args
        // Arguments that aren't entered will be gathered through the react-loop
        new AnyOrderParser(
            new OptionalParser(new HeroParser()),
            new OptionalParser(new RoundParser('ALL')),
            new OptionalParser(new MapDifficultyParser()),
            new OptionalParser(new RoundParser('ALL'))
        )
    );

    if (parsed.hasErrors()) {
        return errorMessage(message, parsed.parsingErrors);
    }

    let startingRound, energizerRound;
    if (parsed.rounds) {
        if (parsed.rounds.length == 1) {
            startingRound = parsed.round;
        } else {
            [startingRound, energizerRound] = parsed.rounds.sort();
        }
    }

    // Start react loop to collect the data that the user didn't provide at command-time
    ReactionChain.process(
        message,
        (message, results) => displayHeroLevels(message, results),
        new MenuReactor('hero', heroMenu, parsed.hero),
        new SingleTextParser(new RoundParser('ALL'), 'starting', startingRound),
        new MenuReactor(
            'map_difficulty',
            mapDifficultyMenu,
            parsed.map_difficulty
        ),
        new SingleTextParser(
            new RoundParser('ALL'),
            'energizer_acquired',
            energizerRound
        )
    );
}

function errorMessage(message, parsingErrors) {
    let errorEmbed = new Discord.MessageEmbed()
        .setTitle('ERROR')
        .addField(
            'Likely Cause(s)',
            parsingErrors.map((msg) => ` • ${msg}`).join('\n')
        )
        .addField('Type `q!herolevelenergizer help` for help', '\u200b')
        .setColor(colours['orange']);

    return message.channel.send({ embeds: [errorEmbed] });
}

function displayHeroLevels(message, results) {
    heroLevels = Heroes.levelingCurve(
        results.hero,
        results.starting_round,
        results.map_difficulty,
        results.energizer_acquired_round
    );
    let res = table(gHelper.range(1, 20), heroLevels.slice(1));
    const embed = new Discord.MessageEmbed()
        .setTitle(`${gHelper.toTitleCase(results.hero)} Leveling Chart`)
        .setDescription(
            `Placed: **R${results.starting_round}**\n` +
                `Maps: **${gHelper.toTitleCase(results.map_difficulty)}**\n` +
                `Energizer: **R${results.energizer_acquired_round}**`
        )
        .addField('\u200b', `${res}`)
        .setColor(colours['cyber']);

    message.channel.send({ embeds: [embed] });
}

module.exports = {
    name: 'herolevelenergizer',
    aliases: [
        'hle',
        'heroeng',
        'heroengz',
        'herenz',
        'henz',
        'heroenz',
        'herolevelenergiser',
        'energiser',
        'energizer',
    ],
    execute,
};

function addSpaces(str, max) {
    let diff = max - str.toString().length;

    for (i = 0; i < diff; i++) str += ' ';

    return str;
}

function table(lvl, round) {
    let finalRes = '`level`|`round`\n';
    let i = 0;
    while (i < 20) {
        // for loop doesnt work here due to black arcane magic
        res = '';
        res += `\`${addSpaces(lvl[i], 5)}`;
        res += '|';
        res += `${addSpaces(round[i], 5)}\``;
        finalRes += res;
        finalRes += '\n';
        i++;
    }
    return finalRes;
}
