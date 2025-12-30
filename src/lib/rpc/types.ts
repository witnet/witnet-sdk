import type { PublicKeyHashString } from "../crypto/types.js";
import type { Epoch, f64, Hash, i64, u8, u16, u32, u64, usize } from "../types.js";

export enum Methods {
	AddPeers = "addPeers",
	AuthorizeStake = "authorizeStake",
	ClearPeers = "clearPeers",
	DataRequestReport = "dataRequestReport",
	GetBalance = "getBalance",
	GetBalance2 = "getBalance2",
	GetBlockChain = "getBlockChain",
	GetBlock = "getBlock",
	GetConsensusConstants = "getConsensusConstants",
	GetDataRequest = "getDataRequest",
	GetMempool = "getMempool",
	GetPkh = "getPkh",
	GetPublicKey = "getPublicKey",
	GetSuperblock = "getSuperblock",
	GetSupplyInfo = "getSupplyInfo",
	GetSupplyInfo2 = "getSupplyInfo2",
	GetTransaction = "getTransaction",
	GetUtxoInfo = "getUtxoInfo",
	GetValueTransfer = "getValueTransfer",
	InitializePeers = "initializePeers",
	Inventory = "inventory",
	KnownPeers = "knownPeers",
	MasterKeyExport = "masterKeyExport",
	NodeStats = "nodeStats",
	Peers = "peers",
	Priority = "priority",
	Protocol = "protocol",
	Providers = "providers",
	QueryStakingPowers = "queryPowers",
	QueryStakes = "queryStakes",
	Rewind = "rewind",
	SearchDataRequests = "searchDataRequests",
	SignalingInfo = "signalingInfo",
	SyncStatus = "syncStatus",
}

export type Network = "mainnet" | "testnet";

export type QueryStakes = {
	filter?: {
		validator?: PublicKeyHashString;
		withdrawer?: PublicKeyHashString;
	};
	params?: QueryStakesParams;
};

export type QueryStakesParams = {
	distinct?: boolean;
	limit?: number;
	offset?: number;
	order?: QueryStakesOrder;
	since?: number;
};

export type QueryStakesOrder = {
	by: StakesOrderBy;
	reverse?: boolean;
};

export enum StakesOrderBy {
	Coins = "coins",
	Nonce = "nonce",
	Mining = "mining",
	Witnessing = "witnessing",
}

export type QueryStakingPowers = {
	distinct?: boolean;
	limit?: number;
	offset?: number;
	orderBy?: StakingCapability;
};

// Structure that the includes the confirmed and pending balance of a node
export type Balance = {
	//Total amount of a node's funds after last confirmed superblock
	confirmed?: bigint;
	//Total amount of node's funds after last block
	total: bigint;
};

// Balance struct in Wit/2 containing locked, unlocked and staked balance
export type Balance2 = {
	locked: bigint;
	staked: bigint;
	unlocked: bigint;
};

//Struct that count the positives votes of a WIP
export type BitVotesCounter = {
	votes: u32;
	period: Epoch;
	wip: string;
	init: Epoch;
	end: Epoch;
	bit: usize;
};

// Block data structure
export type Block = {
	block_header: BlockHeader;
	block_sig: KeyedSignature;
	block_weight: number;
	confirmed: boolean;
	dr_weight: number;
	// txns: BlockTransactions;
	txns_hashes?: BlockTransactionsHashes;
	vt_weight: number;
};

// Block mining eligibility claim
export type BlockEligibilityClaim = {
	// A Verifiable Random Function proof of the eligibility for a given epoch and public key
	proof: VrfProof;
};

// Block header structure
export type BlockHeader = {
	// A checkpoint beacon for the epoch that this block is closing
	beacon: CheckpointBeacon;
	// The Bn256 public key
	bn256_public_key?: Bn256PublicKey;
	// 256-bit hashes of all of the transactions committed to this block, so as to prove their belonging and integrity
	merkle_roots: BlockMerkleRoots;
	// A miner-provided proof of leadership
	proof: BlockEligibilityClaim;
	// 32 bits for binary signaling new witnet protocol improvements.
	// See [WIP-0014](https://github.com/witnet/WIPs/blob/master/wip-0014.md) for more info.
	signals: u32;
};

// Block merkle tree roots
export type BlockMerkleRoots = {
	// A 256-bit hash based on all of the commit transactions committed to this block
	commit_hash_merkle_root: Hash;
	// A 256-bit hash based on all of the data request transactions committed to this block
	dr_hash_merkle_root: Hash;
	// A 256-bit hash based on the mint transaction committed to this block
	mint_hash: Hash;
	// A 256-bit hash based on all of the reveal transactions committed to this block
	reveal_hash_merkle_root: Hash;
	// A 256-bit hash based on all of the tally transactions committed to this block
	tally_hash_merkle_root: Hash;
	// A 256-bit hash based on all of the value transfer transactions committed to this block
	vt_hash_merkle_root: Hash;
};

export type BlockTransactionsHashes = {
	commit: Array<Hash>;
	data_request: Array<Hash>;
	mint: Hash;
	reveal: Array<Hash>;
	tally: Array<Hash>;
	value_transfer: Array<Hash>;
};

// BN256 public key
export type Bn256PublicKey = {
	// Compressed form of a BN256 public key
	public_key: Array<u8>;
	// Cached uncompressed form
	uncompressed: Array<u8>;
};

export type CheckpointBeacon = {
	// The serial number for an epoch
	checkpoint: Epoch;
	// The 256-bit hash of the previous block header
	hashPrevBlock: Hash;
};

// Protocol's consensus constants
export type ConsensusConstants = {
	//An identity is considered active if it participated in the witnessing protocol at least once in the last `activity_period` epochs
	activity_period: u32;

	//Auxiliary bootstrap block hash value
	bootstrap_hash: Hash;

	//Superblock signing committee for the first superblocks
	bootstrapping_committee: Array<string>;

	//Timestamp at checkpoint 0 (the start of epoch 0)
	checkpoint_zero_timestamp: i64;

	//Seconds between the start of an epoch and the start of the next one
	checkpoints_period: u16;

	//Minimum input age of an UTXO for being a valid collateral
	collateral_age: u32;

	//Minimum value in nanowits for a collateral value
	collateral_minimum: bigint;

	//Number of epochs with the minimum difficulty active
	//(This number represent the last epoch where the minimum difficulty is active)
	epochs_with_minimum_difficulty: u32;

	//Extra rounds for commitments and reveals
	extra_rounds: u16;

	//Genesis block hash value
	genesis_hash: Hash;

	//Halving period
	halving_period: u32;

	//Initial block reward
	initial_block_reward: u64;

	//Maximum weight a block can have, this affects the number of
	//transactions a block can contain: there will be as many
	//transactions as the sum of _their_ weights is less than, or
	//equal to, this maximum block weight parameter.
	//
	//Maximum aggregated weight of all the data requests transactions in one block
	max_dr_weight: u32;
	//
	//Maximum aggregated weight of all the value transfer transactions in one block
	max_vt_weight: u32;

	//Minimum difficulty
	minimum_difficulty: u32;

	//Backup factor for mining: valid VRFs under this factor will result in broadcasting a block
	mining_backup_factor: u32;

	//Replication factor for mining: valid VRFs under this factor will have priority
	mining_replication_factor: u32;

	//Reputation will expire after N witnessing acts
	reputation_expire_alpha_diff: u32;

	//Reputation issuance
	reputation_issuance: u32;

	//When to stop issuing new reputation
	reputation_issuance_stop: u32;

	//Penalization factor: fraction of reputation lost by liars for out of consensus claims
	// FIXME(#172): Use fixed point arithmetic
	reputation_penalization_factor: f64;

	//Period after which the committee size should decrease (in superblock periods)
	superblock_committee_decreasing_period: u32;

	//Step by which the committee should be reduced after superblock_agreement_decreasing_period
	superblock_committee_decreasing_step: u32;

	//Build a superblock every `superblock_period` epochs
	superblock_period: u16;

	//Size of the superblock signing committee
	superblock_signing_committee_size: u32;
};

export type DataRequestPayload = {
	dataRequest: RADRequest;
	witness_reward: number;
	witnesses: number;
	commitAndRevealFee: number;
	minConsensusPercentage: number;
	collateral: number;
};

export type DataRequestStatus = "cancelled" | "pending" | "committing" | "revealing" | "solved" | "reverted";

export type GetDataRequestMode = "full" | "ethereal";

// List of outputs related to a data request
export type GetDataRequestFullReport = {
	status: DataRequestStatus;
	report: {
		// List of commitments to resolve the data request
		commits: Record<PublicKeyHashString, DataRequestCommitTransaction>;
		//List of reveals to the commitments (contains the data request witnet result)
		reveals: Record<PublicKeyHashString, DataRequestRevealTransaction>;
		//Tally of data request (contains final result)
		tally?: DataRequestTallyTransaction;
		//Hash of the block with the DataRequestTransaction
		block_hash_dr_tx?: Hash;
		//Hash of the block with the TallyTransaction
		block_hash_tally_tx?: Hash;
		//Current commit round
		current_commit_round: u16;
		//Current reveal round
		current_reveal_round: u16;
		//Current stage, or None if finished
		current_stage?: DataRequestStage;
	};
};

export type GetDataRequestEtherealReport = {
	block_epoch?: number;
	block_hash?: Hash;
	confirmations?: number;
	hash?: Hash;
	query?: {
		dro_hash: Hash;
		rad_hash: Hash;
		rad_bytecode: string;
		collateral_ratio: number;
		unitary_reward: bigint;
		witnesses: number;
	};
	result?: {
		cbor_bytes: string;
		finalized: boolean;
		timestamp: number;
	};
	stage: DataRequestStatus;
};

// Data request current stage
export enum DataRequestStage {
	//Expecting commitments for data request
	COMMIT = "COMMIT",
	//Expecting reveals to previously published commitments
	REVEAL = "REVEAL",
	//Expecting tally to be included in block
	TALLY = "TALLY",
}

export type PriorityEstimate = {
	priority: f64;
	time_to_block: u64;
};

export type Priorities = {
	drt_stinky: PriorityEstimate;
	drt_low: PriorityEstimate;
	drt_medium: PriorityEstimate;
	drt_high: PriorityEstimate;
	drt_opulent: PriorityEstimate;
	st_stinky: PriorityEstimate;
	st_low: PriorityEstimate;
	st_medium: PriorityEstimate;
	st_high: PriorityEstimate;
	st_opulent: PriorityEstimate;
	ut_stinky: PriorityEstimate;
	ut_low: PriorityEstimate;
	ut_medium: PriorityEstimate;
	ut_high: PriorityEstimate;
	ut_opulent: PriorityEstimate;
	vtt_stinky: PriorityEstimate;
	vtt_low: PriorityEstimate;
	vtt_medium: PriorityEstimate;
	vtt_high: PriorityEstimate;
	vtt_opulent: PriorityEstimate;
};

export type KeyedSignature = {
	// Signature
	signature: Signature;
	// Public key
	public_key: {
		compressed: number;
		bytes: Array<u8>;
	};
};

// Result of GetMempool message: list of pending transactions categorized by type
export type Mempool = {
	// Pending value transfer transactions
	value_transfer: Array<Hash>;
	// Pending data request transactions
	data_request: Array<Hash>;
};

// Named tuple of `(address, type)`
export type PeerAddr = {
	//Socket address of the peer
	address: string;
	// "inbound" | "outbound" when asking for connected peers, or
	// "new" | "tried" when asking for all the known peers
	type: string;
};

export type ProtocolInfo = {
	all_checkpoints_periods: Record<string, u8>;
	all_versions: {
		efv: Record<string, Epoch>;
		vfe: Record<Epoch, string>;
	};
	current_version: string;
};

export type RADAggregate = { filters: Array<RADFilter>; reducer: u32 };
export type RADFilter = { op: u32; args: Array<u8> };
export type RADRequest = {
	timeLock: number;
	retrieve: Array<RADRetrieve>;
	aggregate: RADAggregate;
	tally: RADTally;
};
export type RADRetrieve = { type: RADType; url: string; script: Array<u8> };
export type RADTally = {
	filters: Array<RADFilter>;
	reducer: u32;
};

export enum RADType {
	HttpGet = "HTTP-GET",
	HttpPost = "HTTP-POST",
	HttpHead = "HTTP-HEAD",
	Rng = "RNG",
}

// ECDSA (over secp256k1) signature
export type Secp256k1Signature = {
	// The signature serialized in DER
	der: Array<u8>;
};

//Result of GetSignalingInfo
export type SignalingInfo = {
	//List of protocol upgrades that are already active, and their activation epoch
	active_upgrades: Record<string, Epoch>;
	//List of protocol upgrades that are currently being polled for activation signaling
	pending_upgrades: Array<BitVotesCounter>;
	//Last epoch
	epoch: Epoch;
};

// Digital signatures structure (based on supported cryptosystems)
export type Signature = {
	// ECDSA over secp256k1
	Secp256k1: Secp256k1Signature;
};

// State machine for the synchronization status of a Witnet node
export enum StateMachine {
	// First state, ChainManager is waiting for reaching  consensus between its peers
	WaitingConsensus = "WaitingConsensus",
	// Second state, ChainManager synchronization process
	Synchronizing = "Synchronizing ",
	// Third state, `ChainManager` has all the blocks in the chain and is ready to start
	// consolidating block candidates in real time.
	AlmostSynced = "AlmostSynced",
	// Fourth state, `ChainManager` can consolidate block candidates, propose its own
	// candidates (mining) and participate in resolving data requests (witnessing).
	Synced = "Synced",
}

export type StakeAuthorization = {
	withdrawer: PublicKeyHashString;
	signature: KeyedSignature;
};

export type StakeDelegate = {
	coins: bigint;
	validator: PublicKeyHashString;
};

export type StakeEntry = {
	key: {
		validator: PublicKeyHashString;
		withdrawer: PublicKeyHashString;
	};
	value: {
		coins: bigint;
		epochs: Record<StakingCapability, Epoch>;
		nonce: u64;
	};
};

export type Stake = {
	total: bigint;
	delegates: Array<StakeDelegate>;
};

export enum StakingCapability {
	Mining = "mining",
	Witnessing = "witnessing",
}

export type StakingPower = {
	power?: u64;
	ranking?: u32;
	validator: PublicKeyHashString;
	withdrawer: PublicKeyHashString;
};

// Superblock consolidating metadata
// As per current consensus algorithm, "consolidated blocks" implies that there exists at least one
// superblock in the chain that builds upon the superblock where those blocks were anchored.
export type SuperblockReport = {
	//The superblock that we are signaling as consolidated.
	superblock: {
		//Number of signing committee members,
		signing_committee_length: u32;
		//Merkle root of the Active Reputation Set members included into the previous SuperBlock
		ars_root: Hash;
		//Merkle root of the data requests in the blocks created since the last SuperBlock
		data_request_root: Hash;
		//Superblock index,
		index: u32;
		//Hash of the block that this SuperBlock is attesting as the latest block in the block chain,
		last_block: Hash;
		//Hash of the block that the previous SuperBlock used for its own `last_block` field,
		last_block_in_previous_superblock: Hash;
		//Merkle root of the tallies in the blocks created since the last SuperBlock
		tally_root: Hash;
	};
	//The hashes of the blocks that we are signaling as consolidated.
	consolidated_block_hashes: Array<Hash>;
};

export type SupplyInfo = {
	//Current epoch
	epoch: u32;
	//Current time
	current_time: u64;
	//Number of blocks minted
	blocks_minted: u32;
	//WIT minted through block creation
	blocks_minted_reward: u64;
	//Current staked supply
	current_staked_supply: u64;
	//Genesis supply
	genesis_supply: u64;
};

// Information about the total supply provided by the `getSupplyInfo2` sensitive method
export type SupplyInfo2 = {
	//Current epoch
	epoch: u32;
	//Current time
	current_time: u64;
	//Number of blocks minted
	blocks_minted: u32;
	//WIT minted through block creation
	blocks_minted_reward: u64;
	//Amount of nanowits that have been burnt so far
	burnt_supply: bigint;
	//Current locked supply
	current_locked_supply: bigint;
	//Current staked supply
	current_staked_supply: bigint;
	//Current unlocked supply
	current_unlocked_supply: bigint;
	//Initial supply
	initial_supply: bigint;
	//WIT currently locked as collateral by in-flight data requests
	requests_in_flight_collateral: u64;
};

// Node synchronization status
export type SyncStatus = {
	// The hash of the top consolidated block and the epoch of that block
	chain_beacon: CheckpointBeacon;
	// The current epoch, or None if the epoch 0 is in the future
	current_epoch?: Epoch;
	// Node State
	node_state: StateMachine;
};

// Information about our own UTXOs
export type UtxoInfo = {
	//Vector of UtxoPointers with their values, time_locks and if it is ready for collateral
	utxos: Array<UtxoMetadata>;
	//Minimum collateral from consensus constants
	collateral_min: bigint;
};

export type UtxoMetadata = {
	output_pointer: string;
	timelock: u64;
	utxo_mature?: boolean;
	value: bigint;
};

export type ValueTransferOutput = {
	pkh: Hash;
	value: bigint;
	time_lock: u64;
};

// A VRF Proof is a unique, deterministic way to sign a message with a public key.
// It is used to prevent one identity from creating multiple different proofs of eligibility.
export type VrfProof = {
	proof: Uint8Array;
	public_key: Uint8Array; //PublicKey;
};

/// ===================================================================================================================
/// --- Transactions --------------------------------------------------------------------------------------------------

export type TransactionReport = {
	blockEpoch: Epoch;
	blockHash: Hash;
	blockTimestamp: number;
	confirmations: number;
	confirmed: boolean;
	transaction: {
		Reveal?: DataRequestRevealTransaction;
		Commit?: DataRequestCommitTransaction;
		Tally?: DataRequestTallyTransaction;
	};
	weight: number;
};

export type DataRequestCommitTransaction = {
	body: DataRequestCommitTransactionBody;
	signatures: Array<KeyedSignature>;
};

export type DataRequestCommitTransactionBody = {
	// DataRequestTransaction hash
	dr_pointer: Hash;
	// DataRequestRevealTransaction Signature Hash
	commitment: Hash;
	// Change from collateral. The output pkh must be the same as the inputs,
	// and there can only be one output
	outputs: Array<ValueTransferOutput>;
	// BLS public key (curve bn256)
	bn256_public_key?: Bn256PublicKey;

	hash: Hash;
};

export type DataRequestRevealTransaction = {
	body: DataRequestRevealTransactionBody;
	signatures: Array<KeyedSignature>;
};

export type DataRequestRevealTransactionBody = {
	// Inputs
	dr_pointer: Hash; // DTTransaction hash
	// Outputs
	reveal: Array<u8>;
	pkh: { hash: Uint8Array }; // where to receive reward
	hash: Hash;
};

export type DataRequestTallyTransaction = {
	// DataRequestTransaction hash
	dr_pointer: Hash;
	// Tally result
	tally: Uint8Array;
	// Witness rewards
	outputs: Array<ValueTransferOutput>;
	// Addresses that are out of consensus (non revealers included)
	out_of_consensus: Array<{ hash: Uint8Array }>;
	// Addresses that commit a RadonError (or considered as an Error due to a RadonError consensus)
	error_committers: Array<{ hash: Uint8Array }>;
	// TODO
	// hash: Hash;
};

/// Node stats
export type NodeStats = {
	//Number of proposed blocks
	block_proposed_count: u32;
	//Number of blocks included in the block chain
	block_mined_count: u32;
	//Number of times we were eligible to participate in a Data Request
	dr_eligibility_count: u32;
	//Number of proposed commits
	commits_proposed_count: u32;
	//Number of commits included in a data request
	commits_count: u32;
	//Last block proposed
	last_block_proposed: Hash;
	//Number of slashed commits
	slashed_count: u32;
};
