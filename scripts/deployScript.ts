import hardhat from "hardhat";

async function main() {
    console.log("deploy start")

    const LingerieGirls = await hardhat.ethers.getContractFactory("LingerieGirls")
    const lingerieGirls = await LingerieGirls.deploy(
        // LP Token Address
        "0xc7175038323562cb68e4bbdd379e9fe65134937f",
        // SUSHI Address
        "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
    )
    console.log(`LingerieGirls address: ${lingerieGirls.address}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
