const AnyOrderParser = require('../parser/any-order-parser.js');
const OptionalParser = require('../parser/optional-parser.js');

const HeroParser = require('../parser/hero-parser.js');
const RoundParser = require('../parser/round-parser');
const MapDifficultyParser = require('../parser/map-difficulty-parser.js');

const ReactionChain = require('../reactor/reaction_chain');
const EmojiReactor = require('../reactor/emoji_reactor');
const SingleTextParser = require('../reactor/single_text_parser');

const Heroes = require('../helpers/heroes');

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
        new EmojiReactor('hero', Guilds.EMOJIS_SERVER, parsed.hero),
        new SingleTextParser(new RoundParser('ALL'), 'starting', startingRound),
        new EmojiReactor(
            'map_difficulty',
            Guilds.EMOJIS_SERVER,
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
        .addField('Type `q!herolevel help` for help', '\u200b')
        .setColor(colours['orange']);

    return message.channel.send(errorEmbed);
}

function displayHeroLevels(message, results) {
    heroLevels = Heroes.levelingCurve(
        results.hero,
        results.starting_round,
        results.map_difficulty,
        results.energizer_acquired_round
    );
    let res = table(h.range(1, 20), heroLevels.slice(1));
    const embed = new Discord.MessageEmbed()
        .setTitle(`${h.toTitleCase(results.hero)} Leveling Chart`)
        .setDescription(
            `Placed: **R${results.starting_round}**\n` +
                `Maps: **${h.toTitleCase(results.map_difficulty)}**\n` +
                `Energizer: **R${results.energizer_acquired_round}**`
        )
        .addField('\u200b', `${res}`)
        .setColor(colours['cyber']);

    message.channel.send(embed);
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
