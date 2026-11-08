# The Digital Noble Mark

Spaza shopkeeping and inventory prototype with XRPL Testnet payments and store analytics.

A local shop management app with point of sale, inventory, supplier management, XRPL Testnet payments, and sales analytics. The interface uses an orange, black, and white visual theme.

## Run locally

Requirements: Python 3.11 or newer.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
./start_app.sh
```

Run `./start_app.sh`, then download and open the [interactive HTML preview](./preview.html) in a browser. It embeds the app running on this computer and can use the local API and XRPL Testnet wallet. If your service uses a different port, change the preview's **Local app address** field (the default `start_app.sh` port is `8000`). The preview does not host the backend. Card checkout is still a no-charge demo; XRP actions use Testnet and require your review in the app. The first start initializes a local API key and SQLite database. Keep `.env` and the database on your computer; both are excluded from Git.

## Set up an XRPL Testnet wallet

1. Run the local service and open the dashboard from the address above.
2. Select **Testnet setup** in the top bar and choose **Create & fund test wallet**.
3. The app generates the wallet locally, stores its secret in the private `.env` file, and asks the official XRPL Testnet faucet for test XRP.
4. Copy the public address shown in the wallet panel. Use this wallet only on Testnet; it cannot receive or send Mainnet funds.

Supplier payments require a connected Testnet wallet and the supplier's public Testnet destination. Add an address under **Edit details**, or link a supplier email to its public address once and select that email. The **Pay supplier** action is available on every supplier card; if the address is missing, it opens a direct action to add it. Choose a wallet transfer or the optional x402 route, review the destination, amount and checks, then tick the owner approval box before sending. Never enter a seed or secret into a supplier address field.

## Payments and withdrawals

- **Demo card checkout:** the form is prefilled with sample card data. It records a clearly labelled demo deposit and does not contact a card processor or charge a card.
- **Testnet deposit:** enter the XRP amount and, optionally, the public Testnet address funds will be sent from. Then make the payment from that wallet to the shop's displayed Testnet receiving address. The sending address is a match check only; it cannot create XRP or move funds. Never enter a secret or recovery phrase. Email is optional contact information and does not change how XRPL addresses a payment.
- **Email recipient:** link a recipient's email to their public XRPL Testnet address once in **Manage linked emails**. Later sends can use the email alone; the transfer still goes to its saved address. Email is not a native XRPL address or global email-to-wallet lookup service.
- **Send XRP worldwide:** enter a public XRPL Testnet address or select a previously linked email. Review the destination, fee, reserve and policy checks, then approve the transfer. Test XRP has no cash value and this app cannot send Mainnet XRP.
- **Bank payouts and card refunds:** these require Paystack credentials and verified funds. They are separate from Testnet XRP transfers.

Card sample data and profit allocations are simulations. Incoming and outgoing XRP payments are read from validated XRPL Testnet account history and refresh about every 5 seconds while the app is open. A Testnet deposit request is marked validated when the requested amount arrives at the shop address and, if entered, from the expected sender address. A request alone does not create a deposit: send XRP to the shop wallet from a different Testnet wallet. Testnet balances and transfers are not real money.

The supplier editor can save both a public wallet address and an optional **x402 service URL**. On the x402 route, the app checks the URL's HTTP 402 challenge without paying and requires its exact XRP amount and recipient to match the supplier and amount you entered. After owner confirmation, the XRPL x402 client signs the exact Testnet payment, gets a facilitator receipt, and retries the protected service request with that receipt. The app then independently checks the transaction hash against validated XRPL Testnet ledger data before marking the supplier payment complete. It is configured for xrpl:1 only and caps the network fee. If the resource request or receipt is interrupted after payment, the app records an unknown or pending outcome and warns you not to retry blindly. A passing challenge-format check does not verify the service operator or guarantee the service is safe; review every payment independently.

The **Payment safeguards** page also includes a live read-only Testnet server status panel with validated ledger sequence, age, quorum and peer count. It monitors the public RPC server configured by the app; it is not a validator operated by this shop. Running a true `rippled` validator requires dedicated, continuously available infrastructure and inclusion in trusted validator lists. The included `xrpl-py` SDK signs and submits app payments; it does not run a validator. The x402 XRPL client requires Python 3.11 or newer.

## Shop analytics and inventory

The overview period selector shows recorded sales, supplier spend, and estimated net profit across the past week, month, or three months. Values update when sales or supplier payments are recorded. The inventory page tracks total products, in-stock and out-of-stock items, near-expiry items, expired items, and low stock; expired products cannot be rung up for sale. First-run historical entries are clearly marked as demo history. Reset demo restores sample data.

Profit in this prototype is calculated as recorded sales minus recorded supplier payments. It is an operational estimate, not accounting or tax reporting. The app stores shop state locally in SQLite and the browser stores presentation preferences locally.

## Safety and configuration

The backend is locked to XRPL Testnet and binds to loopback (`127.0.0.1`). The local API key is generated by `cli.py init`; do not publish it or your `.env` file. Do not change the network setting to Mainnet. Test XRP has no cash value.

The integration checks policy limits, supplier allowlisting, transaction intent, reserve, fee, and ledger state before signing. Treat this build as a local prototype rather than a production financial service. Before public hosting or handling customer payments, commission a security review, implement production-grade custody and recovery, and connect regulated payment providers.

## Live exchange estimate

The dashboard displays an indicative XRP spot quote using CoinGecko, with CoinPaprika and ExchangeRate-API fallback sources. This estimate is informational; it is not a trade, supplier settlement quote, or financial recommendation.

## Languages

Use the language picker for English, isiZulu, isiXhosa, Afrikaans, Sesotho, Kiswahili, Hausa, Yorùbá, French, and Portuguese. Navigation and common dashboard actions are translated; less common copy may remain in English.
