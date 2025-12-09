import cbor from "cbor";

export enum Opcodes {
	Mode = 0x08,
	StandardDeviation = 0x05,
}

export class RadonFilter {
	readonly opcode: Opcodes;
	readonly args?: any;

	constructor(opcode: Opcodes, args?: any) {
		this.opcode = opcode;
		this.args = args;
		Object.defineProperty(this, "toString", {
			value: () => {
				switch (this.opcode) {
					case Opcodes.Mode:
						return "Class(mode)";
					case Opcodes.StandardDeviation:
						return `Class(stdev = ${args})`;
				}
			},
		});
	}

	public toJSON(humanize?: boolean): any {
		const json: any = {
			op: humanize ? Opcodes[this.opcode] : this.opcode,
		};
		if (this.args) {
			json.args = humanize ? this.args : Array.from(cbor.encode(this.args));
		} else if (!humanize) {
			json.args = Array.from(cbor.encode([]));
		}
		return json;
	}

	public toProtobuf(): any {
		const protobuf: any = {
			op: this.opcode,
		};
		if (this.args) {
			protobuf.args = Array.from(cbor.encode(this.args));
		} else {
			protobuf.args = Array.from(cbor.encode([]));
		}
		return protobuf;
	}
}

export function Mode() {
	return new RadonFilter(Opcodes.Mode);
}
export function Stdev(stdev: number) {
	return new RadonFilter(Opcodes.StandardDeviation, stdev);
}
