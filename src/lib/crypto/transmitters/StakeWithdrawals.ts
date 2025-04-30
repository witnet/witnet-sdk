import { UnstakePayload, StakeWithdrawalParams } from "../payloads/UnstakePayload"

import { TransactionReceipt } from "../types"
import { ILedger } from "../interfaces"
import { Transmitter } from "../transmitters"
import { PublicKeyHashString } from "../types"

import { Hash } from "../../types"

export { StakeWithdrawalParams } from "../payloads/UnstakePayload"

export class StakeWithdrawals extends Transmitter<StakeWithdrawalParams, UnstakePayload> {
    
    public static MIN_TIMELOCK_SECS = UnstakePayload.MIN_TIMELOCK_SECS
    public static WEIGHT = UnstakePayload.WEIGHT

    public static from(ledger: ILedger): StakeWithdrawals {
        return new StakeWithdrawals(ledger)
    }

    constructor (ledger: ILedger, changePkh?: PublicKeyHashString) {
        super("UnstakeTransaction", new UnstakePayload("UnstakeTransactionBody"), ledger, changePkh)
    }

    public async signTransaction(params?: StakeWithdrawalParams, reload?: boolean): Promise<TransactionReceipt> {
        return super.signTransaction(params, reload)
    }

    public _signTransactionPayload(): Hash {
        const hash = this._payload.hash
        if (!hash) {
            throw Error(
                `${this.constructor.name}: internal error: unable to hashify payload: ${this._payload.toJSON(true)}}.`
            )
        } else {
            const signer = this.ledger.getSigner()
            if (signer) {
                this._signatures.push(signer.signHash(hash))
            } else {
                throw Error(
                    `${this.constructor.name}: internal error: no default Signer found in ${this.ledger.constructor.name} ${this.ledger.pkh}.`
                )
            }            
            return hash
        }
        
    }

    protected _toJSON(humanize: boolean): any {
        return {
            [this.type]: {
                body: this._payload.toJSON(humanize),
                signature: this._signatures[0],
            }
        }
    }

    protected _toProtobuf(): any {
        const body = this._payload.toProtobuf()
        if (body && this._signatures.length > 0) {
            return {
                body,
                signature: this._signatures[0]
            }
        }
    }
}
