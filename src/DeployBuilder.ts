import PWCore, {Address, Amount, AmountUnit, Builder, Cell, RawTransaction, SUDT, Transaction} from "@lay2/pw-core";
import BasicCollector from "./BasicCollector";

export default class DeployBuilder extends Builder
{
	issuerAddress: Address;
	destinationAddress: Address;
	collector: BasicCollector;
	fee: Amount;
	data: string;

	constructor(issuerAddress: Address, destinationAddress: Address, collector: BasicCollector, fee: Amount, data: string)
	{
		super();

		this.issuerAddress = issuerAddress;
		this.destinationAddress = destinationAddress;
		this.collector = collector;
		this.fee = fee;
		this.data = data;
	}

	async build(): Promise<Transaction>
	{
		// Aliases
		const issuerAddress = this.issuerAddress;
		const destinationAddress = this.destinationAddress;
		const collector = this.collector;
		const fee = this.fee;
		const data = this.data;

		// Arrays for our input cells, output cells, and cell deps, which will be used in the final transaction.
		const inputCells = [];
		const outputCells = [];
		const cellDeps = [];

		// Create the SUDT output cell.
		const lockScript = destinationAddress.toLockScript();
		const deployCell = new Cell(new Amount(String(61 + ((data.length-2)/2)), AmountUnit.ckb), lockScript, undefined, undefined, data);
		outputCells.push(deployCell);

		// Calculate the required capacity. (deploy cell + change cell minimum (61) + fee)
		const neededAmount = deployCell.capacity.add(new Amount("61", AmountUnit.ckb)).add(fee);

		// Add necessary capacity.
		const capacityCells = await collector.collectCapacity(issuerAddress, neededAmount);
		for(const cell of capacityCells)
			inputCells.push(cell);

		// Calculate the input capacity and change cell amounts.
		const inputCapacity = inputCells.reduce((a, c)=>a.add(c.capacity), Amount.ZERO);
		const changeCapacity = inputCapacity.sub(neededAmount.sub(new Amount("61", AmountUnit.ckb)));

		// Add the change cell.
		const changeLockScript = issuerAddress.toLockScript()
		const changeCell = new Cell(changeCapacity, changeLockScript);
		outputCells.push(changeCell);

		// Add the required cell deps.
		cellDeps.push(PWCore.config.defaultLock.cellDep);
		// cellDeps.push(PWCore.config.pwLock.cellDep);
		// cellDeps.push(PWCore.config.sudtType.cellDep);

		// Generate a transaction and calculate the fee. (The second argument for witness args is needed for more accurate fee calculation.)
		const tx = new Transaction(new RawTransaction(inputCells, outputCells, cellDeps), [Builder.WITNESS_ARGS.RawSecp256k1]);
		this.fee = Builder.calcFee(tx);

		// Throw error if the fee is too low.
		if(this.fee.gt(fee))
			throw new Error(`Fee of ${fee} is below the calculated fee requirements of ${this.fee}.`);

		// Return our unsigned and non-broadcasted transaction.
		return tx;
	}
}
