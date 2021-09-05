import hardhat from "hardhat";

async function main() {
    console.log("deploy start")

    const LingerieGirls = await hardhat.ethers.getContractFactory("LingerieGirls")
    const lingerieGirls = await LingerieGirls.deploy(
        // LP Token Address
        "0xc7175038323562cb68e4bbdd379e9fe65134937f",
        // SUSHI Address
        "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
        // Powers
        [79,75,67,78,71,72,66,72,68,65,76,69,63,70,69,71,67,73,70,62,74,79,65,75,64,69,73,68,77,78]
    )
    console.log(`LingerieGirls address: ${lingerieGirls.address}`)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
