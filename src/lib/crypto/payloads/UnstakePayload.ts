import { Epoch, Nanowits, ValueTransferOutput } from "../../types"

import { ILedger, IProvider } from "../interfaces"
import { TransactionPayload } from "../payloads"
import { Coins, PublicKeyHash, PublicKeyHashString, TransactionParams, TransactionPriority } from "../types"


export type StakeWithdrawalParams = TransactionParams & {
    nonce?: Epoch,
    validator: PublicKeyHashString,
    value: Coins,
}

export class UnstakePayload extends TransactionPayload<StakeWithdrawalParams> {

    public static MIN_TIMELOCK_SECS = 1_209_600;
    public static WEIGHT = 153;

    protected _outputs: Array<ValueTransferOutput> = []

    constructor (protoTypeName: string, specs?: any) {
        super(protoTypeName, specs)
    }

    public get covered(): boolean {
        return this._covered > 0
            && this.outputs.length > 0 
    }

    public get maxWeight(): number {
        return UnstakePayload.WEIGHT
    }

    public get outputs(): Array<ValueTransferOutput> {
        return this._outputs
    }

    public get prepared(): boolean {
        return (
            this._target !== undefined
                && this._outputs.length > 0
        )
    }

    public get value(): Coins {
        return this._target?.value || Coins.zero()
    }

    public get weight(): number {
        return UnstakePayload.WEIGHT
    }
    
    public async consumeUtxos(ledger: ILedger): Promise<number> {
        if (!this._target) {
            throw new Error(`${this.constructor.name}: internal error: no in-flight params.`)
        
        } else if (!this._covered) {
            const signer = ledger.getSigner()
            if (!signer) {
                throw new Error(
                    `${this.constructor.name}: internal error: no default Signer for ${ledger.constructor.name} ${ledger.pkh}.`
                )
            }
            // settle fees if none specified
            if (this._target?.fees instanceof Coins) {
                this._fees = this._target.fees.pedros
            } else {
                const priority = this._target?.fees as TransactionPriority || TransactionPriority.Medium
                this._fees = await this._estimateNetworkFees(ledger.provider, priority)
            }
            // determine whether withdrawn amount covers MORE than the fees
            this._change = this.value.pedros - this._fees
            if (this._change > 0) {
                // settle nonce if none specified
                this._covered = this._target?.nonce || await signer.getStakeEntryNonce(this._target.validator)
                this._outputs.push({
                    pkh: signer.pkh,
                    value: this.value.pedros - this._fees,
                    time_lock: UnstakePayload.MIN_TIMELOCK_SECS
                })
            }
        }
        return this._change;
    }

    public intoReceipt(target: StakeWithdrawalParams) {
        return {
            nonce: target.nonce,
            outputLock: UnstakePayload.MIN_TIMELOCK_SECS,
            validator: target.validator,
            ...(this._outputs ? { withdrawer: this._outputs[0].pkh } : {}),
        }
    }

    public prepareOutputs(): any {}

    public resetTarget(target: StakeWithdrawalParams): any {
        this._change = 0 
        this._covered = 0
        this._fees = 0
        this._outputs = []
        this._target = target
    }

    public toJSON(_humanize = false): any {
        return {
            fee: this._fees,
            nonce: this._covered,
            operator: this._target?.validator,
            withdrawal: {
                pkh: this.outputs[0].pkh,
                value: this.outputs[0].value,
                time_lock: UnstakePayload.MIN_TIMELOCK_SECS,
            },
        }
    }   

    public toProtobuf(): any {
        if (this.prepared && this._target) {
            return {
                fee: this._fees,
                nonce: this._covered,
                operator: { hash: Array.from(PublicKeyHash.fromBech32(this._target.validator).toBytes20()) },
                withdrawal: {
                    pkh: { hash: Array.from(PublicKeyHash.fromBech32(this.outputs[0].pkh).toBytes20()) },
                    value: this.outputs[0].value,
                    timeLock: this.outputs[0].time_lock,
                },
            }
        }
    }

    public validateTarget(target?: any): StakeWithdrawalParams | undefined {
        target = this._cleanTargetExtras(target)
        if (target && Object.keys(target).length > 0) {
            if (!(
                target
                    && (
                        !target?.fees 
                        || (
                            target.fees instanceof Coins && (target.fees as Coins).pedros > 0 
                            || Object.values(TransactionPriority).includes(target.fees)
                        )
                    )
                    && target?.value && (target.value as Coins).pedros > 0
                    && target?.validator
            )) {
                throw new TypeError(`${this.constructor.name}: invalid specs were provided: ${JSON.stringify(target)}`)
            } else {
                if (target?.nonce || parseInt(target.nonce) <= 0) {
                    throw new TypeError(`${this.constructor.name}: nonce must be positive if provided.`)
                }
                return target as StakeWithdrawalParams
            }
        } else {
            return undefined
        }
    }

    protected _cleanTargetExtras(target?: any): any {
        if (target) {
            return Object.fromEntries(
                Object.entries(target).filter(([key,]) => [
                    'fees',
                    'nonce',
                    'value',
                    'validator',
                ].includes(key))
            )
        }
    }

    protected async _estimateNetworkFees(provider: IProvider, priority = TransactionPriority.Medium): Promise<Nanowits> {
        if (!this._priorities) {
            this._priorities = await provider.priorities()
        }
        return Math.floor(
            // todo: replace `vtt_` for `ut_`
            this._priorities[`vtt_${priority}`].priority
                * this.weight
        );
    }
}
