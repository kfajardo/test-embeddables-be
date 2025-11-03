const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const http = require("http");
const https = require("https");
const fs = require("fs");

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "https://localhost:5173"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});

const scopes = {
  withoutAccountID: [
    "/accounts.read",
    "/accounts.write",
    "/accounts/{accountID}/profile.read",
    "/fed.read",
    "/profile-enrichment.read",
  ],
  withAccountID: [
    "/accounts.read",
    "/accounts.write",
    "/fed.read",
    "/profile-enrichment.read",
    "/accounts/{accountID}/bank-accounts.read",
    "/accounts/{accountID}/bank-accounts.write",
    "/accounts/{accountID}/capabilities.read",
    "/accounts/{accountID}/capabilities.write",
    "/accounts/{accountID}/cards.read",
    "/accounts/{accountID}/cards.write",
    "/accounts/{accountID}/profile.read",
    "/accounts/{accountID}/profile.write",
    "/accounts/{accountID}/representatives.read",
    "/accounts/{accountID}/representatives.write",
  ],
};

const getScopes = (accountID, getAllScopes = false) => {
  const filteredScopes = getAllScopes
    ? scopes.withAccountID
    : scopes.withoutAccountID;

  console.log(
    getAllScopes
      ? "GETTING ALL SCOPES for " + accountID
      : "getting basic scopes"
  );

  return filteredScopes.join(" ").replaceAll("{accountID}", accountID);
};

app.get("/accessToken", async (req, res) => {
  try {
    const { accountID } = req.query;
    const moovAccountID = accountID ?? process.env.MOOV_ACCOUNT_ID;

    const shouldGetAllScopes = !!accountID;

    const response = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3000",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          scope: getScopes(moovAccountID, shouldGetAllScopes),
        }),
      }
    );

    if (!response.ok) {
      return res
        .status(400)
        .json({ status: "failed", message: "Error fetching moov accessToken" });
    }

    const data = await response.json();
    console.log("fetched from /accessToken");

    res.status(200).json({ ...data });
  } catch (error) {
    console.log(error);
    res
      .status(400)
      .json({ status: "failed", message: "Error fetching moov accessToken" });
  }
});

app.post("/refreshAccessToken", async (req, res) => {
  const { refreshToken, accountID } = req.body;
  const credentials = btoa(
    `${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET}`
  );

  console.log("Creating token for user accountID", accountID);

  console.log(`${process.env.MOOV_API_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-moov-version": "v2025.07.00",
      Origin: "http://localhost:3000",
      Referer: "http://localhost:3000",
      // Authorization: `Basic ${credentials}`
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.MOOV_PUBLIC_KEY,
      client_secret: process.env.MOOV_SECRET,
      // refreshToken,
      scope: getScopes(accountID, true),
    }),
  });
  try {
    const response = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3030",
          // Authorization: `Basic ${credentials}`
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          // refreshToken,
          scope: getScopes(accountID, true),
        }),
      }
    );

    if (!response.ok) {
      return res.status(400).json({
        status: "failed",
        message: "Error fetching refreshed accessToken",
      });
    }

    const data = await response.json();
    console.log("fetched from /refreshAccessToken", data);

    res.status(200).json({ ...data });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: "failed",
      message: "Error fetching refreshed accessToken!",
    });
  }
});

// Get all Moov accounts
app.get("/accounts", async (req, res) => {
  try {
    // Get access token
    const tokenResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          scope: getScopes(process.env.MOOV_ACCOUNT_ID, false),
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return res.status(400).json({
        status: "failed",
        message: "Failed to get access token",
        error: errorData,
      });
    }

    const { access_token } = await tokenResponse.json();

    const credentials = Buffer.from(
      `${process.env.MOOV_PUBLIC_KEY}:${process.env.MOOV_SECRET}`
    ).toString("base64");

    // Fetch all accounts from Moov
    const accountsResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/accounts`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${credentials}`,
          "x-moov-version": "v2025.07.00",
          Origin: "https://localhost:3000",
          Referer: "https://localhost:3000",
        },
      }
    );

    if (!accountsResponse.ok) {
      const errorData = await accountsResponse.json();
      console.error("Error fetching accounts:", errorData);
      return res.status(400).json({
        status: "failed",
        message: "Failed to fetch Moov accounts",
        error: errorData,
      });
    }

    const accountsData = await accountsResponse.json();
    console.log(
      `Successfully fetched ${accountsData.length || 0} accounts from Moov`
    );

    res.status(200).json({
      status: "success",
      count: accountsData.length || 0,
      accounts: accountsData,
    });
  } catch (error) {
    console.error("Error in /accounts:", error);
    res.status(500).json({
      status: "failed",
      message: "Error fetching Moov accounts",
      error: error.message,
    });
  }
});

// Get payment methods for a specific account
app.get("/accounts/:accountID/payment-methods", async (req, res) => {
  try {
    const { accountID } = req.params;

    if (!accountID) {
      return res.status(400).json({
        status: "failed",
        message: "accountID is required",
      });
    }

    // Get scoped access token for this account
    const tokenResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          scope: getScopes(accountID, true),
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return res.status(400).json({
        status: "failed",
        message: "Failed to get access token",
        error: errorData,
      });
    }

    const { access_token } = await tokenResponse.json();

    // Fetch bank accounts (payment methods) from Moov
    const paymentMethodsResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}/bank-accounts`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "x-moov-version": "v2025.07.00",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3000",
        },
      }
    );

    if (!paymentMethodsResponse.ok) {
      const errorData = await paymentMethodsResponse.json();
      console.error(
        `Error fetching payment methods for ${accountID}:`,
        errorData
      );
      return res.status(400).json({
        status: "failed",
        message: "Failed to fetch payment methods",
        error: errorData,
      });
    }

    const paymentMethodsData = await paymentMethodsResponse.json();
    console.log(
      `Successfully fetched ${
        paymentMethodsData.length || 0
      } payment methods for account ${accountID}`
    );

    res.status(200).json({
      status: "success",
      accountID,
      count: paymentMethodsData.length || 0,
      paymentMethods: paymentMethodsData,
    });
  } catch (error) {
    console.error("Error in /accounts/:accountID/payment-methods:", error);
    res.status(500).json({
      status: "failed",
      message: "Error fetching payment methods",
      error: error.message,
    });
  }
});

// Get wallet for a specific account
app.get("/accounts/:accountID/wallet", async (req, res) => {
  try {
    const { accountID } = req.params;

    if (!accountID) {
      return res.status(400).json({
        status: "failed",
        message: "accountID is required",
      });
    }

    // Get scoped access token for this account
    const tokenResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          scope: getScopes(accountID, true),
        }),
      }
    );

    console.log("1", tokenResponse);

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return res.status(400).json({
        status: "failed",
        message: "Failed to get access token",
        error: errorData,
      });
    }

    console.log("2");

    const { access_token } = await tokenResponse.json();

    // Fetch wallet from Moov
    const walletResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}/wallets`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "x-moov-version": "v2025.07.00",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3000",
        },
      }
    );

    if (!walletResponse.ok) {
      const errorData = await walletResponse.json();
      console.error(
        `Error fetching wallet for ${accountID}:`,
        errorData,
        walletResponse
      );
      return res.status(400).json({
        status: "failed",
        message: "Failed to fetch wallet",
        error: errorData,
      });
    }

    const walletData = await walletResponse.json();
    console.log(`Successfully fetched wallet for account ${accountID}`);

    res.status(200).json({
      status: "success",
      accountID,
      wallet: walletData,
    });
  } catch (error) {
    console.error("Error in /accounts/:accountID/wallets:", error.message);
    res.status(500).json({
      status: "failed",
      message: "Error fetching wallet",
      error: error.message,
    });
  }
});

app.post("/accounts/:accountID/add-plaid-link", async (req, res) => {
  const { accountID } = req.params;
  try {
    if (!accountID) {
      return res.status(400).json({
        status: "failed",
        message: "accountID is required",
      });
    }

    // Get scoped access token for this account
    const tokenResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          scope: getScopes(accountID, true),
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return res.status(400).json({
        status: "failed",
        message: "Failed to get access token",
        error: errorData,
      });
    }

    const { access_token } = await tokenResponse.json();

    console.log(
      "/add-plaid-link request",
      req.body.processor_token,
      req.params.accountID,
      access_token,
      {
        plaidLink: {
          publicToken: req.body.public_token,
        },
      }
    );
    // Fetch wallet and bank accounts in parallel
    const moovPlaidResponse = await fetch(
      `http://api.moov.io/accounts/${accountID}/bank-accounts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "x-moov-version": "v2025.07.00",
          Origin: "http://localhost:3000",
          Referer: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plaid: {
            token: req.body.processor_token,
          },
        }),
      }
    );

    const data = await moovPlaidResponse.json();

    console.log("moovPlaidResponse", data);

    return res.status(200).json(data);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({
      status: "failed",
      message: `Error Add Plaid information to Moov Account ${accountID}`,
      error: error.message,
    });
  }
});

// Create Moov Account (Business) - Manual Onboarding
app.post("/create-account", async (req, res) => {
  try {
    const { operators } = req.body;

    if (!operators || !Array.isArray(operators) || operators.length === 0) {
      return res.status(400).json({
        status: "failed",
        message: "operators array is required and must not be empty",
      });
    }

    // First, get an access token
    const tokenResponse = await fetch(
      `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moov-version": "v2025.07.00",
        },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: process.env.MOOV_PUBLIC_KEY,
          client_secret: process.env.MOOV_SECRET,
          scope: getScopes("", false),
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return res.status(400).json({
        status: "failed",
        message: "Failed to get access token",
        error: errorData,
      });
    }

    const { access_token: initialToken } = await tokenResponse.json();
    const createdAccounts = [];
    const errors = [];

    // Process each operator
    for (const operator of operators) {
      try {
        const { businessInfo, contact, bankAccount } = operator;

        // 1. Create business account with defaults
        // Normalize business type to supported values
        const normalizeBusinessType = (type) => {
          if (!type) return "llc";
          const normalized = type.toLowerCase().trim();
          const typeMap = {
            llc: "llc",
            corporation: "privateCorporation",
            corp: "privateCorporation",
            inc: "privateCorporation",
            incorporated: "privateCorporation",
            partnership: "partnership",
            soleProprietorship: "soleProprietorship",
            "sole proprietorship": "soleProprietorship",
            unincorporatedAssociation: "unincorporatedAssociation",
            trust: "trust",
            publicCorporation: "publicCorporation",
            privateCorporation: "privateCorporation",
            nonprofit: "unincorporatedNonProfit",
          };
          return typeMap[normalized] || "llc";
        };

        const accountData = {
          accountType: "business",
          profile: {
            business: {
              legalBusinessName: businessInfo.legalBusinessName,
              businessType: normalizeBusinessType(businessInfo.businessType),
              website: businessInfo.website,
              email: businessInfo.email,
              phone: businessInfo.phone,
              address: businessInfo.address,
              ...(businessInfo.doingBusinessAs && {
                doingBusinessAs: businessInfo.doingBusinessAs,
              }),
              ...(businessInfo.description && {
                description: businessInfo.description,
              }),
              ...(businessInfo.taxID && {
                taxID: { ein: { number: businessInfo.taxID } },
              }),
              ...(businessInfo.industryCodes && {
                industryCodes: businessInfo.industryCodes,
              }),
            },
          },
          capabilities: ["transfers", "send-funds", "collect-funds", "wallet"],
        };

        console.log(
          "Creating account with data:",
          JSON.stringify(accountData, null, 2)
        );

        const createAccountResponse = await fetch(
          `${process.env.MOOV_API_BASE_URL}/accounts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${initialToken}`,
              "x-moov-version": "v2025.07.00",
              Origin: "http://localhost:3000",
              Referer: "http://localhost:3000",
            },
            body: JSON.stringify(accountData),
          }
        );

        if (!createAccountResponse.ok) {
          const errorData = await createAccountResponse.json();
          console.error(
            `Error creating account for ${businessInfo.legalBusinessName}:`,
            errorData
          );
          errors.push({
            operator: businessInfo.legalBusinessName,
            step: "create_account",
            error: errorData,
          });
          continue;
        }

        const accountResult = await createAccountResponse.json();
        const accountID = accountResult.accountID;
        console.log(
          `Account created successfully: ${accountID} for ${businessInfo.legalBusinessName}`
        );

        // 2. Get scoped access token for this account
        const scopedTokenResponse = await fetch(
          `${process.env.MOOV_API_BASE_URL}/oauth2/token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-moov-version": "v2025.07.00",
            },
            body: JSON.stringify({
              grant_type: "client_credentials",
              client_id: process.env.MOOV_PUBLIC_KEY,
              client_secret: process.env.MOOV_SECRET,
              scope: getScopes(accountID, true),
            }),
          }
        );

        let scopedToken = initialToken;
        if (scopedTokenResponse.ok) {
          const tokenData = await scopedTokenResponse.json();
          scopedToken = tokenData.access_token;
        }

        // 3. Generate and Accept Terms of Service
        // First, get a ToS token
        const getTosTokenResponse = await fetch(
          `${process.env.MOOV_API_BASE_URL}/tos-token`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${scopedToken}`,
              "x-moov-version": "v2025.07.00",
              Origin: "http://localhost:3000",
              Referer: "http://localhost:3000",
            },
          }
        );

        if (getTosTokenResponse.ok) {
          const tosTokenData = await getTosTokenResponse.json();
          console.log(`ToS token received for account ${accountID}`);

          // Now accept the ToS with the token
          const tosData = {
            termsOfService: {
              token: tosTokenData.token,
            },
          };

          const acceptTosResponse = await fetch(
            `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${scopedToken}`,
                "x-moov-version": "v2025.07.00",
                Origin: "http://localhost:3000",
                Referer: "http://localhost:3000",
              },
              body: JSON.stringify(tosData),
            }
          );

          if (!acceptTosResponse.ok) {
            const errorData = await acceptTosResponse.json();
            console.error(
              `Error accepting TOS for ${businessInfo.legalBusinessName}:`,
              JSON.stringify(errorData, null, 2)
            );
            errors.push({
              operator: businessInfo.legalBusinessName,
              accountID,
              step: "accept_terms_of_service",
              error: errorData,
            });
          } else {
            console.log(`Terms of Service accepted for account ${accountID}`);
          }
        } else {
          const errorData = await getTosTokenResponse.json();
          console.error(
            `Error getting ToS token for ${businessInfo.legalBusinessName}:`,
            JSON.stringify(errorData, null, 2)
          );
          errors.push({
            operator: businessInfo.legalBusinessName,
            accountID,
            step: "get_tos_token",
            error: errorData,
          });
        }

        // 4. Add representative (contact) with owner defaults
        if (contact) {
          const representativeData = {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            address: contact.address,
            birthDateProvided: true,
            governmentIDProvided: true,
            birthDate: contact.birthDate,
            governmentID: contact.governmentID,
            responsibilities: {
              isController: contact.responsibilities?.isController ?? true,
              isOwner: contact.responsibilities?.isOwner ?? true,
              ownershipPercentage:
                contact.responsibilities?.ownershipPercentage ?? 100,
              jobTitle: contact.responsibilities?.jobTitle || "Owner",
            },
          };

          const addRepResponse = await fetch(
            `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}/representatives`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${scopedToken}`,
                "x-moov-version": "v2025.07.00",
                Origin: "http://localhost:3000",
                Referer: "http://localhost:3000",
              },
              body: JSON.stringify(representativeData),
            }
          );

          if (!addRepResponse.ok) {
            const errorData = await addRepResponse.json();
            console.error(
              `Error adding representative for ${businessInfo.legalBusinessName}:`,
              errorData
            );
            errors.push({
              operator: businessInfo.legalBusinessName,
              accountID,
              step: "add_representative",
              error: errorData,
            });
          } else {
            const repResult = await addRepResponse.json();
            console.log(`Representative added for account ${accountID}`);

            // After adding representative, mark owners as provided
            const ownersProvidedData = {
              profile: {
                business: {
                  ownersProvided: true,
                },
              },
            };

            const updateOwnersResponse = await fetch(
              `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${scopedToken}`,
                  "x-moov-version": "v2025.07.00",
                  Origin: "http://localhost:3000",
                  Referer: "http://localhost:3000",
                },
                body: JSON.stringify(ownersProvidedData),
              }
            );

            if (!updateOwnersResponse.ok) {
              const errorData = await updateOwnersResponse.json();
              console.error(
                `Error marking owners as provided for ${businessInfo.legalBusinessName}:`,
                JSON.stringify(errorData, null, 2)
              );
              errors.push({
                operator: businessInfo.legalBusinessName,
                accountID,
                step: "mark_owners_provided",
                error: errorData,
              });
            } else {
              console.log(`Owners marked as provided for account ${accountID}`);
            }
          }
        }

        // 5. Update underwriting information
        const underwritingData = {
          averageTransactionSize: businessInfo.averageTransactionSize || 500,
          maxTransactionSize: businessInfo.maxTransactionSize || 5000,
          averageMonthlyTransactionVolume:
            businessInfo.averageMonthlyTransactionVolume || 500000,
        };

        const updateUnderwritingResponse = await fetch(
          `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}/underwriting`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${scopedToken}`,
              "x-moov-version": "v2025.07.00",
              Origin: "http://localhost:3000",
              Referer: "http://localhost:3000",
            },
            body: JSON.stringify(underwritingData),
          }
        );

        if (!updateUnderwritingResponse.ok) {
          const errorData = await updateUnderwritingResponse.json();
          console.error(
            `Error updating underwriting for ${businessInfo.legalBusinessName}:`,
            JSON.stringify(errorData, null, 2)
          );
          errors.push({
            operator: businessInfo.legalBusinessName,
            accountID,
            step: "update_underwriting",
            error: errorData,
          });
        } else {
          console.log(
            `Underwriting information updated for account ${accountID}`
          );
        }

        // 6. Add bank account
        if (bankAccount) {
          const bankAccountData = {
            account: {
              accountNumber: bankAccount.accountNumber,
              routingNumber: bankAccount.routingNumber,
              bankAccountType: bankAccount.bankAccountType || "checking",
              holderName:
                bankAccount.holderName || businessInfo.legalBusinessName,
              holderType: bankAccount.holderType || "business",
            },
          };

          console.log(
            `Adding bank account for ${accountID}:`,
            JSON.stringify(bankAccountData, null, 2)
          );

          const addBankResponse = await fetch(
            `${process.env.MOOV_API_BASE_URL}/accounts/${accountID}/bank-accounts`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${scopedToken}`,
                "x-moov-version": "v2025.07.00",
                Origin: "http://localhost:3000",
                Referer: "http://localhost:3000",
              },
              body: JSON.stringify(bankAccountData),
            }
          );

          if (!addBankResponse.ok) {
            const errorData = await addBankResponse.json();
            console.error(
              `Error adding bank account for ${businessInfo.legalBusinessName}:`,
              JSON.stringify(errorData, null, 2)
            );
            errors.push({
              operator: businessInfo.legalBusinessName,
              accountID,
              step: "add_bank_account",
              error: errorData,
            });
          } else {
            const bankResult = await addBankResponse.json();
            console.log(
              `Bank account added successfully for account ${accountID}:`,
              JSON.stringify(bankResult, null, 2)
            );

            // 7. Initiate micro-deposit verification if needed
            if (bankResult.bankAccountID) {
              console.log(
                `Bank account ID: ${bankResult.bankAccountID} - May require micro-deposit verification`
              );
            }
          }
        }

        // Store successful account creation
        createdAccounts.push({
          operatorName: businessInfo.legalBusinessName,
          accountID,
          moovAccount: accountResult,
          accessToken: scopedToken,
        });
      } catch (operatorError) {
        console.error(`Error processing operator:`, operatorError);
        errors.push({
          operator: operator.businessInfo?.legalBusinessName || "Unknown",
          step: "processing",
          error: operatorError.message,
        });
      }
    }

    // Return results
    res.status(createdAccounts.length > 0 ? 201 : 400).json({
      status: createdAccounts.length > 0 ? "success" : "failed",
      message: `Processed ${operators.length} operators. Created ${createdAccounts.length} accounts.`,
      accounts: createdAccounts,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    console.error("Error in create-account:", error);
    res.status(500).json({
      status: "failed",
      message: "Error creating Moov accounts",
      error: error.message,
    });
  }
});

app.post("/plaid/create-token", async (req, res) => {
  try {
    const response = await fetch(
      "https://sandbox.plaid.com/link/token/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_API_KEY,
          user: {
            client_user_id: "kfajardo",
            phone_number: "+1 415 555 0123",
          },
          client_name: "Personal Finance App",
          products: ["transactions"],
          transactions: {
            days_requested: 730,
          },
          country_codes: ["US"],
          language: "en",
          account_filters: {
            depository: {
              account_subtypes: ["checking", "savings"],
            },
            credit: {
              account_subtypes: ["credit card"],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Plaid API error:", errorData);
      return res.status(response.status).json({
        status: "failed",
        message: "Error creating PLAID token",
        error: errorData,
      });
    }

    const data = await response.json();

    return res.status(200).json({
      link_token: data.link_token,
    });
  } catch (error) {
    console.error("Error in /plaid/create-token:", error);
    return res.status(500).json({
      status: "failed",
      message: "Error creating PLAID token",
      error: error.message,
    });
  }
});

app.post("/plaid/moov-processor-token", async (req, res) => {
  try {
    console.log("REQUEST BODY moov-processor-token", req.body, {
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_API_KEY,
      public_token: req.body.public_token,
    });
    const responsePublicToken = await fetch(
      "https://sandbox.plaid.com/item/public_token/exchange",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_API_KEY,
          public_token: req.body.public_token,
        }),
      }
    );

    if (!responsePublicToken.ok) {
      const errorData = await responsePublicToken.json();
      console.error("Plaid public token exchange error:", errorData);
      return res.status(responsePublicToken.status).json({
        status: "failed",
        message: "Error exchanging public token",
        error: errorData,
      });
    }

    const publicToken = await responsePublicToken.json();
    console.log("publicToken", publicToken);
    // access_token
    // item_id
    // request_id

    const response = await fetch(
      "https://sandbox.plaid.com/processor/token/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_API_KEY,
          access_token: publicToken.access_token,
          account_id: req.body.account_id,
          processor: "moov",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Plaid processor token error:", errorData);
      return res.status(response.status).json({
        status: "failed",
        message: "Error creating processor token",
        error: errorData,
      });
    }

    const data = await response.json();

    console.log("processorToken", data, data.processor_token);

    return res.status(200).json({
      processor_token: data.processor_token,
    });
  } catch (error) {
    console.error("Error in /plaid/moov-processor-token:", error);
    return res.status(500).json({
      status: "failed",
      message: "Error creating PLAID token",
      error: error.message,
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

// Check if SSL certificates exist
const keyPath = path.join(__dirname, "..", "localhost-key.pem");
const certPath = path.join(__dirname, "..", "localhost.pem");

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  // HTTPS server
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS Server is running on https://localhost:${PORT}`);
  });
} else {
  // Fallback to HTTP if certificates don't exist
  app.listen(PORT, () => {
    console.log(`HTTP Server is running on http://localhost:${PORT}`);
    console.log("Note: SSL certificates not found. Server running on HTTP.");
    console.log("To enable HTTPS, run: mkcert -install && mkcert localhost");
  });
}
