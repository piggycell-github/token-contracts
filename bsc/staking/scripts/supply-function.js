import functions from "@google-cloud/functions-framework";
import { ethers } from "ethers";

// 토큰 주소 (BSC Mainnet)
const TOKEN_ADDRESS = "0x46345336E7C5C89bd15D557203040f2c1aB4dd18";

// ERC20 ABI
const ERC20_ABI = [
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

// LockedTokenVault ABI (추가 정보 조회용 - 선택적)
const VAULT_ABI = [
    "function _UNDISTRIBUTED_AMOUNT_() view returns (uint256)",
    "function _TOKEN_() view returns (address)",
];

// BSC RPC 엔드포인트
const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
// const BSC_RPC_URL = "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

// Locked Token Vault 주소들
// Vault 컨트랙트의 토큰 잔액 = 실제로 locked된 수량
const VAULT_ADDRESSES = [
    '0x879184c639a190f8dE8C462b25b03d598112b7a6',
    '0xdB85Ff0DBCE5e0dF33Dc2354bB2c05e1fF798E9f',
    '0x8bF15576C6104f380Ae32D5C897e6996C90Edf80',
    '0x5F55C793c40b9835871e0EB6D897353160E73Af1',
    '0x0540bef38E9F9e6aEFeEd382Fb97987a3a4eBDdF',
    '0xB90A06c1Fa7E143F2017087a8c0627c10EF9CaB1',
    '0xF81B907aCA4Ba383b9babE5f6d050A412bBf7a83',
    '0xd4789C1FFe1c8F446dcE94977C756DB8ae7baf88',
    '0xDaedceED4dd3f3a9E26731A798Ff33C49fCCc4eC',
];

// 순환 공급에서 제외할 기타 주소 (Vault가 아닌 주소)
const OTHER_LOCKED_ADDRESSES = [
    // 팀/재단 지갑 등
];

/**
 * 토큰 공급량 조회 API
 * 경로에 따라 다른 데이터 반환:
 * - / 또는 /circulatingSupply: Circulating Supply
 * - /totalSupply: Total Supply
 */
functions.http("supply", async (req, res) => {
    try {
        // CORS 헤더 설정
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "GET");
        res.set("Access-Control-Allow-Headers", "Content-Type");

        // Preflight 요청 처리
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }

        // 경로 확인
        const path = req.path || "/";
        const isTotalSupply = path.includes("totalSupply");

        // BSC 네트워크에 연결
        const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);

        // 토큰 컨트랙트 인스턴스 생성
        const tokenContract = new ethers.Contract(
            TOKEN_ADDRESS,
            ERC20_ABI,
            provider,
        );

        // Total Supply 가져오기
        let totalSupply = await tokenContract.totalSupply();
        const decimals = await tokenContract.decimals();

        // 응답 형식 결정 (쿼리 파라미터로 제어)
        const format = req.query.format || "plain";

        // totalSupply 경로인 경우
        if (isTotalSupply) {
            const totalSupplyFormatted = ethers.formatUnits(totalSupply, decimals);

            if (format === "plain") {
                res.set("Content-Type", "text/plain");
                res.send(totalSupplyFormatted);
            } else {
                res.set("Content-Type", "application/json");
                res.json({
                    success: true,
                    data: {
                        totalSupply: totalSupplyFormatted,
                        totalSupplyRaw: totalSupply.toString(),
                        decimals: Number(decimals),
                        tokenAddress: TOKEN_ADDRESS,
                        network: "BSC",
                    },
                    timestamp: new Date().toISOString(),
                });
            }
            return;
        }

        // circulatingSupply 경로인 경우 (기본값)
        // Locked 토큰 계산
        let totalLocked = 0n;
        let vaultLocked = 0n;
        let otherLocked = 0n;
        let totalUndistributed = 0n;

        // 1. LockedTokenVault의 토큰 잔액 조회
        for (const vaultAddress of VAULT_ADDRESSES) {
            const balance = await tokenContract.balanceOf(vaultAddress);
            vaultLocked += balance;
            totalLocked += balance;

            // 선택적: undistributed 정보도 조회 (참고용)
            try {
                const vaultContract = new ethers.Contract(
                    vaultAddress,
                    VAULT_ABI,
                    provider,
                );
                const undistributed = await vaultContract._UNDISTRIBUTED_AMOUNT_();
                totalUndistributed += undistributed;
            } catch (error) {
                console.log(`Could not read undistributed for ${vaultAddress}`);
            }
        }

        // 2. 기타 locked 주소
        for (const address of OTHER_LOCKED_ADDRESSES) {
            const balance = await tokenContract.balanceOf(address);
            otherLocked += balance;
            totalLocked += balance;
        }

        // Circulating Supply = Total Supply - Locked Tokens
        const circulatingSupply = totalSupply - totalLocked;

        // 포맷팅
        const circulatingSupplyFormatted = ethers.formatUnits(
            circulatingSupply,
            decimals,
        );

        if (format === "plain") {
            res.set("Content-Type", "text/plain");
            res.send(circulatingSupplyFormatted);
        } else {
            const totalSupplyFormatted = ethers.formatUnits(totalSupply, decimals);
            const totalLockedFormatted = ethers.formatUnits(totalLocked, decimals);
            const vaultLockedFormatted = ethers.formatUnits(vaultLocked, decimals);
            const otherLockedFormatted = ethers.formatUnits(otherLocked, decimals);
            const totalUndistributedFormatted = ethers.formatUnits(
                totalUndistributed,
                decimals,
            );

            res.set("Content-Type", "application/json");
            res.json({
                success: true,
                data: {
                    circulatingSupply: circulatingSupplyFormatted,
                    circulatingSupplyRaw: circulatingSupply.toString(),
                    totalSupply: totalSupplyFormatted,
                    totalSupplyRaw: totalSupply.toString(),
                    locked: {
                        total: totalLockedFormatted,
                        totalRaw: totalLocked.toString(),
                        vaultLocked: vaultLockedFormatted,
                        vaultLockedRaw: vaultLocked.toString(),
                        otherAddresses: otherLockedFormatted,
                        otherAddressesRaw: otherLocked.toString(),
                        undistributed: totalUndistributedFormatted,
                        undistributedRaw: totalUndistributed.toString(),
                    },
                    decimals: Number(decimals),
                    tokenAddress: TOKEN_ADDRESS,
                    vaultAddresses: VAULT_ADDRESSES,
                    otherLockedAddresses: OTHER_LOCKED_ADDRESSES,
                    network: "BSC",
                },
                timestamp: new Date().toISOString(),
            });
        }
    } catch (error) {
        console.error("Error fetching supply:", error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});
