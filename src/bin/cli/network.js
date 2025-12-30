import { Witnet } from "../../../dist/src/index.js";
import * as helpers from "../helpers.js";

const FLAGS_LIMIT_MAX = 2048;
const FLAGS_LIMIT_DEFAULT = 64;
const OPTIONS_DEFAULT_SINCE = -2048;

const { cyan, white, gray, green, lcyan, lyellow, mgreen, mred, myellow, yellow } = helpers.colors;

/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// CLI SUBMODULE CONSTANTS ===========================================================================================

export const envars = {
	WITNET_SDK_PROVIDER_URL: "=> Wit/Oracle RPC provider(s) to connect to, if no otherwise specified.",
};
export const flags = {
	limit: {
		hint: "Limits number of output records (default: 64).",
		param: "LIMIT",
	},
	offset: {
		hint: "Skips first records as found on server side (default: 0).",
		param: "SKIP",
	},
	provider: {
		hint: "Public Wit/Oracle JSON-RPC provider, other than default.",
		param: "PROVIDER_URL",
	},
	verbose: {
		hint: "Outputs detailed information.",
	},
};
export const router = {
	blocks: {
		hint: "List recently validated blocks.",
		options: {
			since: {
				hint: "Since the specified epoch (default: -<LIMIT>-2).",
				param: "EPOCH|MINUS_EPOCHS",
			},
		},
	},
	constants: {
		hint: "Show network's consensus constants.",
	},
	fees: {
		hint: "Estimate transaction fees based on recent network activity.",
		params: '"vtt" | "drt" | "st" | "ut"',
		options: {
			eti: {
				hint: "Expected time before inclusion (default: 60 seconds).",
				param: "ETI_SECONDS",
			},
			weight: {
				hint: "Assuming this transaction weight (default: 1).",
				param: "TX_WEIGHT",
			},
		},
	},
	holders: {
		hint: "List identities holding Wits within the specified range.",
		options: {
			"min-balance": {
				hint: "Having at least this amount of unlocked Wits (default: 1 Wit).",
				param: "WITS",
			},
			"max-balance": {
				hint: "Having at most this amount of unlocked Wits.",
				param: "WITS",
			},
		},
	},
	knownPeers: {
		hint: "Get a full list of peers as known by the Wit/Oracle RPC provider(s).",
	},
	mempool: {
		hint: "Dump current transactions mempool.",
		params: '["vtt" | "drt" | "st" | "ut"]',
		options: {
			count: { hint: "Just count the number of entries (ignoring limit)." },
			offset: {
				hint: "Skips first matching entries (default: 0).",
				param: "OFFSET",
			},
		},
	},
	powers: {
		hint: "List validation identities ordered by their current mining power.",
		options: {
			distinct: { hint: "Include only the first appearance per validator." },
			witnessing: { hint: "Order by witnessing power instead." },
		},
	},
	provider: {
		hint: "Show the underlying Wit/RPC provider and network id being used.",
	},
	senate: {
		hint: "List distinct identities that have lately validated at least one block.",
		options: {
			since: {
				hint: "Since the specified epoch (default: -2048).",
				param: "MINUS_EPOCHS",
			},
		},
	},
	stakes: {
		hint: "List active stake entries at present time.",
		options: {
			validator: { hint: "Filter by validator address.", param: "WIT_ADDRESS" },
			withdrawer: {
				hint: "Filter by withdrawer address.",
				param: "WIT_ADDRESS",
			},
		},
	},
	"stats*": {
		hint: "Report network stats.",
	},
	status: {
		hint: "Report the sync status of the network's Wit/Oracle RPC provider being used.",
	},
	supplyInfo: {
		hint: "Get network's Wit supply information.",
	},
	versions: {
		hint: "List known protocol versions and which one is currently live.",
	},
	wips: {
		hint: "Show currently activated WIPs on the network.",
		options: {
			pending: { hint: "Only shows pending upgrades, if any." },
		},
	},
};

export const subcommands = {
	blocks,
	constants,
	holders,
	knownPeers,
	mempool,
	fees: priorities,
	powers,
	provider,
	senate,
	stakes,
	supplyInfo,
	status: syncStatus,
	versions,
	wips,
};

/// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/// CLI SUBMODULE COMMANDS ============================================================================================

async function blocks(options = {}) {
	options.limit = Math.min(parseInt(options.limit, 10) || FLAGS_LIMIT_DEFAULT, FLAGS_LIMIT_MAX);
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	// todo: use prompter?
	const records = await provider.blocks(parseInt(options?.since, 10) || -options.limit - 2, options.limit);
	if (records.length > 0) {
		helpers.traceTable(
			records.slice(0, options.limit).map((record) => [record[0], record[1]]),
			{
				headlines: ["EPOCH", "BLOCK HASHES"],
				humanizers: [helpers.commas],
				colors: [undefined, helpers.colors.gray],
			},
		);
		console.info(`^ Listed ${records.length} blocks for a range of ${options.limit} epochs.`);
	} else {
		console.info(
			`> No blocks found in specified range (since: ${options?.since || -options.limit}, limit: ${options.limit}).`,
		);
	}
}

async function constants(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	console.info(await provider.constants());
}

async function holders(options = {}) {
	options.limit = Math.min(parseInt(options.limit, 10) || FLAGS_LIMIT_DEFAULT, FLAGS_LIMIT_MAX);
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const records = Object.entries(
		await helpers.prompter(
			provider.holders(
				options["min-balance"] ? options["min-balance"] * 10 ** 9 : 1000000,
				options["max-balance"] ? options["max-balance"] * 10 ** 9 : null,
			),
		),
	);
	const totalRecords = records.length;
	helpers.traceTable(
		records
			.slice(0, options.limit)
			.map(([address, balance], index) => [
				index + 1,
				address,
				...(options?.verbose
					? [
							Witnet.Coins.fromNanowits(balance.locked).wits,
							Witnet.Coins.fromNanowits(balance.staked).wits,
							Witnet.Coins.fromNanowits(balance.unlocked).wits,
						]
					: []),
				Witnet.Coins.fromNanowits(balance.locked + balance.staked + balance.unlocked).wits,
			]),
		{
			headlines: [
				"RANK",
				"HOLDERS",
				...(options?.verbose ? ["Locked ($WIT)", "Staked ($WIT)", "Available ($WIT)"] : []),
				"BALANCE ($WIT)",
			],
			humanizers: [undefined, undefined, helpers.commas, helpers.commas, helpers.commas, helpers.commas],
			colors: [undefined, mgreen, ...(options?.verbose ? [gray, yellow, myellow] : []), lyellow],
		},
	);
	if (options.limit < totalRecords) {
		console.info(`^ Listed ${Math.min(options.limit, totalRecords)} out of ${totalRecords} records.`);
	}
}

async function knownPeers(options = {}) {
	if (!options) options = {};
	options.limit = parseInt(options.limit, 10) || FLAGS_LIMIT_DEFAULT;
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const knownPeers = await provider.knownPeers();
	console.info(knownPeers);
}

async function mempool(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	console.info(await provider.mempool());
}

async function powers(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const query = {
		distinct: options?.distinct || false,
		limit: parseInt(options.limit, 10) || FLAGS_LIMIT_DEFAULT,
		offset: parseInt(options?.offset, 10) || 0,
		orderBy: options?.witnessing ? "witnessing" : "mining",
	};
	const records = await provider.powers(query);
	if (records.length > 0) {
		helpers.traceTable(
			records.map((record) => [
				record.ranking,
				record.validator,
				...(options?.verbose ? [record.withdrawer] : []),
				record.power,
			]),
			{
				headlines: [
					"G_RANK",
					"VALIDATORS",
					...(options?.verbose ? ["Withdrawer"] : []),
					`${query.orderBy.toUpperCase()} POWER`,
				],
				colors: [
					undefined,
					helpers.colors.green,
					...(options?.verbose ? [helpers.colors.mgreen] : []),
					query.orderBy === "mining" ? helpers.colors.mcyan : helpers.colors.mmagenta,
				],
				humanizers: [helpers.commas, undefined, ...(options?.verbose ? [undefined, helpers.commas] : [helpers.commas])],
			},
		);
		if (records.length === query.limit || query.offset === 0) {
			console.info(`^ Listed ${records.length} records.`);
		} else if (query.offset !== 0) {
			console.info(`^ Listed ${records.length} out of ${records.length + query.offset} records.`);
		}
	} else {
		if (query.offset === 0) {
			console.info("> No records found.");
		} else {
			console.info(`> No as many as ${query.offset + 1} records exist.`);
		}
	}
}

async function priorities(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	console.info(await provider.priorities());
}

async function provider(options = {}) {
	const provider = await Witnet.JsonRpcProvider.fromEnv(options?.provider);
	console.info(`> Witnet RPC provider: ${white(provider.endpoints)}`);
	console.info(
		`> Witnet environment:  ${
			provider.networkId === 40941
				? lcyan("MAINNET")
				: provider.network === "testnet"
					? cyan("TESTNET")
					: mred("Unknown")
		}`,
	);
	console.info(`> Witnet network id:   ${green(`0x${provider.networkId.toString(16).toUpperCase()}`)}`);
}

async function senate(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const params = {
		distinct: true,
		limit: Math.min(parseInt(options.limit, 10) || FLAGS_LIMIT_DEFAULT, FLAGS_LIMIT_MAX),
		offset: parseInt(options?.offset || 0, 10),
		order: { by: "mining" },
		since: -Math.abs(parseInt(options?.since, 10) || OPTIONS_DEFAULT_SINCE) - 1,
	};
	const records = await provider.stakes({ params }); // todo: use prompter?
	if (records.length > 0) {
		helpers.traceTable(
			records.map((record, index) => [
				...(options?.verbose
					? [index + 1, record.key.validator, record.value.nonce, record.value.epochs.witnessing]
					: [record.key.validator]),
				record.value.epochs.mining,
			]),
			{
				headlines: [
					...(options?.verbose
						? ["INDEX", `Superblock Voting Committee ${params.since + 1}`, "Nonce", "LW_Epoch"]
						: [`Superblock Voting Committee ${params.since + 1}`]),
					"LM_Epoch",
				],
				humanizers: [
					...(options?.verbose
						? [helpers.commas, undefined, helpers.commas, helpers.commas, helpers.commas]
						: [undefined, helpers.commas, helpers.commas, helpers.commas]),
				],
				colors: [
					...(options?.verbose
						? [undefined, undefined, undefined, helpers.colors.magenta, helpers.colors.mcyan]
						: [undefined, helpers.colors.mcyan]),
				],
			},
		);
		if (records.length < params.limit) {
			if (params.offset === 0) {
				console.info(`^ Only ${records.length} qualified members out of ${params.limit} seats.`);
			} else {
				console.info(`^ Listed ${records.length} out of ${records.length + params.offset} members.`);
			}
		} else {
			console.info(`^ Listed ${records.length} members.`);
		}
	} else {
		if (params.offset === 0) {
			console.info("No qualified members found.");
		} else {
			console.info(`No as many as ${params.offset} qualified members exist.`);
		}
	}
}

async function stakes(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const query = {
		params: {
			limit: Math.min(parseInt(options.limit, 10) || FLAGS_LIMIT_DEFAULT, FLAGS_LIMIT_MAX),
			offset: parseInt(options?.offset || 0, 10),
		},
	};
	if (options?.validator) query.filter = { validator: options.validator };
	if (options?.withdrawer) query.filter = { ...query.filter, withdrawer: options.withdrawer };
	const records = await provider.stakes(query); // todo: use prompter?
	if (records.length > 0) {
		helpers.traceTable(
			records.map((record, index) => [
				1 + index + query.params.offset,
				record.key.withdrawer,
				record.key.validator,
				...(options?.verbose ? [record.value.nonce, record.value.epochs.witnessing, record.value.epochs.mining] : []),
				Witnet.Coins.fromNanowits(record.value.coins).wits,
			]),
			{
				headlines: [
					options?.validator || options?.withdrawer ? "RANK" : "G_RANK",
					"STAKERS",
					"Validator",
					...(options?.verbose ? ["Nonce", "LW_Epoch", "LM_Epoch"] : []),
					"STAKED ($WIT)",
				],
				humanizers: [
					undefined,
					undefined,
					undefined,
					...(options?.verbose ? [helpers.commas, helpers.commas, helpers.commas] : []),
					(x) => helpers.commas(Math.floor(parseFloat(x))),
				],
				colors: [
					undefined,
					helpers.colors.mgreen,
					undefined,
					...(options?.verbose ? [undefined, helpers.colors.magenta, helpers.colors.cyan] : []),
					helpers.colors.myellow,
				],
			},
		);
		if (records.length === query.params.limit || query.params.offset === 0) {
			console.info(`^ Listed ${records.length} records.`);
		} else if (query.params.offset !== 0) {
			console.info(`^ Listed ${records.length} out of ${records.length + query.params.offset} records.`);
		}
	} else {
		if (query.params.offset === 0) {
			console.info("> No records found.");
		} else {
			console.info(`> No as many as ${query.params.offset + 1} records exist.`);
		}
	}
}

async function supplyInfo(options = {}) {
	const reporter = new Witnet.JsonRpcProvider(options?.provider || process.env.WITNET_SDK_PROVIDER_URL);
	const data = await reporter.supplyInfo();
	console.info(`> Supply info at epoch ${helpers.colors.white(helpers.commas(data.epoch))}:`);
	const records = [];
	records.push(["Minted blocks", `${helpers.toFixedTrunc((100 * data.blocks_minted) / (data.epoch - 1), 1)} %`]);
	records.push(["Minted rewards", helpers.whole_wits(data.blocks_minted_reward, 2)]);
	if (data.current_staked_supply) {
		records.push(["Staked supply", helpers.whole_wits(data.current_staked_supply, 2)]);
	}
	records.push([
		"Circulating supply",
		helpers.whole_wits(
			BigInt(data.genesis_supply) + BigInt(data.blocks_minted_reward) - BigInt(data.current_staked_supply),
			2,
		),
	]);
	helpers.traceTable(records, {
		headlines: [":KPI", "VALUE"],
		colors: [helpers.colors.mgreen, helpers.colors.myellow],
	});
}

async function syncStatus(options = {}) {
	const provider = await Witnet.JsonRpcProvider.fromEnv(options?.provider);
	const syncStatus = await provider.syncStatus();
	helpers.traceTable(
		[
			[
				provider.network === "mainnet" ? "Mainnet" : `Testnet (${provider.networkId.toString(16).toUpperCase()})`,
				syncStatus.node_state || "",
				syncStatus.current_epoch,
				syncStatus.chain_beacon.checkpoint,
				syncStatus.chain_beacon.hashPrevBlock,
			],
		],
		{
			headlines: ["NETWORK", ":STATUS", "Current epoch", "Checkpoint epoch", "Checkpoint block hash"],
			humanizers: [undefined, undefined, helpers.commas, helpers.commas],
			colors: [helpers.colors.mgreen, helpers.colors.lgreen, helpers.colors.white, undefined, helpers.colors.gray],
		},
	);
}

async function versions(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const protocolInfo = await provider.protocolInfo();
	if (
		protocolInfo?.all_checkpoints_periods &&
		protocolInfo?.all_versions?.efv &&
		Object.keys(protocolInfo.all_versions.efv).length > 0
	) {
		const records = Object.fromEntries(
			Object.entries(protocolInfo.all_checkpoints_periods)
				.sort(([a], [b]) => b - a)
				.map(([version, period]) => [version, { period }]),
		);
		Object.entries(protocolInfo.all_versions.efv).forEach(([key, epoch]) => {
			if (records[key]) records[key].epoch = epoch;
		});
		helpers.traceTable(
			Object.entries(records).map(([key, props]) => [key === "V1_7" ? "V1_0" : key, props?.epoch, props?.period]),
			{
				headlines: [":Version", "Activation epoch", ":Block time (secs)"],
				humanizers: [undefined, helpers.commas],
				colors: [helpers.colors.mgreen, helpers.colors.white, helpers.colors.normal],
			},
		);
	}
	console.info(`Current protocol version is ${helpers.colors.mgreen(protocolInfo.current_version)}.`);
}

async function wips(options = {}) {
	const provider = new Witnet.JsonRpcProvider(options?.provider);
	const wips = await provider.wips();
	if (!options?.pending) {
		// console.info(`> Active WIP upgrades at epoch ${helpers.colors.white(helpers.commas(wips.epoch))}:`)
		const active_upgrades = Object.entries(wips.active_upgrades).map(([wip, epoch]) => [wip, epoch]);
		helpers.traceTable(active_upgrades, {
			headlines: [":WIP", "Activation epoch"],
			humanizers: [undefined, helpers.commas],
			colors: [helpers.colors.mcyan, helpers.colors.white],
		});
	}
	if (wips.pending_upgrades || options?.pending) {
		if (wips.pending_upgrades.length === 0) {
			console.info(`> No pending WIP upgrades at epoch ${helpers.colors.white(helpers.commas(wips.epoch))}.`);
		} else {
			console.info(`Pending WIP upgrades at epoch ${helpers.colors.white(helpers.commas(wips.epoch))}:`);
			const pending_upgrades = wips.pending_upgrades.map((upgrade) => {
				return [
					upgrade.wip,
					upgrade.bit,
					upgrade.init,
					upgrade.votes,
					upgrade.period,
					// upgrade.end,
				];
			});
			helpers.traceTable(pending_upgrades, {
				headlines: [
					":WIP",
					"WIP_BIT",
					"From epoch",
					"Aye votes",
					"Duration",
					// "Deadline",
				],
				humanizers: [undefined, undefined, helpers.commas, helpers.commas, helpers.commas, helpers.commas],
				colors: [
					helpers.colors.lcyan,
					helpers.colors.mcyan,
					helpers.colors.white,
					helpers.colors.myellow,
					helpers.colors.mgreen,
					// helpers.colors.myellow,
				],
			});
		}
	}
}
