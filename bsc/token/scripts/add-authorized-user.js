import hre from "hardhat";
import dotenv from "dotenv";

dotenv.config();

const { ethers } = hre;

async function main() {
  const contractAddress = "0x647A713993b5aDBD9a57A03D791f7F82AcAA7A5A";
  const userToAuthorize = "0xB9956078f4b89cD9BA38Ef0d4cbB01C3004d3636";

  console.log("🔑 권한 부여 시작...");
  console.log("컨트랙트 주소:", contractAddress);
  console.log("권한 부여할 주소:", userToAuthorize);

  // Get the contract
  const PiggycellToken = await ethers.getContractFactory("PiggycellToken");
  const token = PiggycellToken.attach(contractAddress);

  // Get the signer (owner)
  const [signer] = await ethers.getSigners();
  console.log("트랜잭션 발신자:", signer.address);

  // Check if user is already authorized
  const isAlreadyAuthorized = await token.authorizedUsers(userToAuthorize);
  if (isAlreadyAuthorized) {
    console.log("⚠️  이미 권한이 부여된 주소입니다.");
    return;
  }

  // Add authorized user
  console.log("\n📝 권한 부여 트랜잭션 전송 중...");
  const tx = await token.addAuthorizedUser(userToAuthorize);

  console.log("트랜잭션 해시:", tx.hash);
  console.log("⏳ 블록 확인 대기 중...");

  const receipt = await tx.wait();

  console.log("\n✅ 권한 부여 완료!");
  console.log("블록 번호:", receipt.blockNumber);
  console.log("가스 사용량:", receipt.gasUsed.toString());

  // Verify authorization
  const isAuthorized = await token.isAuthorized(userToAuthorize);
  console.log("\n확인 결과:");
  console.log("권한 상태:", isAuthorized ? "✅ 권한 있음" : "❌ 권한 없음");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  });
