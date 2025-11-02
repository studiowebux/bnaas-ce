// Secrets management service with encryption
import {
  CreateSecretRequest,
  Secret,
  UpdateSecretRequest,
} from "../types/orchestrator.ts";

export class SecretsService {
  private encryptionKey: CryptoKey | null = null;
  private initPromise: Promise<void>;
  private keyFilePath: string;

  constructor(keyFilePath?: string) {
    this.keyFilePath = keyFilePath || "./data/encryption.key";
    this.initPromise = this.initializeEncryption();
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  private async initializeEncryption(): Promise<void> {
    try {
      // Try to load existing key from environment or generate new one
      const passphrase = Deno.env.get("SECRETS_KEY");

      if (passphrase) {
        try {
          // Derive key from passphrase using PBKDF2
          console.log("Deriving encryption key from SECRETS_KEY passphrase");
          this.encryptionKey = await this.deriveKeyFromPassphrase(passphrase);
          console.log(
            "Successfully derived encryption key from environment passphrase",
          );
        } catch (keyError) {
          console.error(
            "Failed to derive encryption key from passphrase:",
            (keyError as Error).message,
          );
          console.warn("Falling back to file-based or generated key...");
          // Fall through to check file or generate new key
        }
      }

      if (!this.encryptionKey) {
        // Check if key file exists
        let keyExists = false;

        try {
          const savedPassphrase = await Deno.readTextFile(this.keyFilePath);
          this.encryptionKey = await this.deriveKeyFromPassphrase(
            savedPassphrase.trim(),
          );
          console.log(
            `Loaded encryption key from passphrase file: ${this.keyFilePath}`,
          );
          keyExists = true;
        } catch (error) {
          // Key file doesn't exist or is invalid, generate new passphrase
        }

        if (!keyExists) {
          // Generate new passphrase (16 random characters for good entropy)
          const newPassphrase = this.generateRandomPassphrase();
          this.encryptionKey = await this.deriveKeyFromPassphrase(
            newPassphrase,
          );

          // Save passphrase to file
          try {
            // Ensure directory exists
            const keyDir = this.keyFilePath.substring(
              0,
              this.keyFilePath.lastIndexOf("/"),
            );
            if (keyDir) {
              await Deno.mkdir(keyDir, { recursive: true });
            }
            await Deno.writeTextFile(this.keyFilePath, newPassphrase);
            console.log(
              `Generated and saved new encryption passphrase to ${this.keyFilePath}`,
            );
          } catch (saveError) {
            console.error("Failed to save encryption passphrase:", saveError);
            console.warn(
              " Generated new encryption passphrase. Set SECRETS_KEY environment variable:",
            );
            console.warn(`   export SECRETS_KEY='${newPassphrase}'`);
          }

          console.warn(
            " WARNING: If you had existing secrets, they are now unreadable!",
          );
        }
      }
    } catch (error) {
      console.error("Failed to initialize encryption:", error);
      throw new Error("Secrets service initialization failed");
    }
  }

  private async deriveKeyFromPassphrase(
    passphrase: string,
  ): Promise<CryptoKey> {
    // Use PBKDF2 to derive a 256-bit key from the passphrase
    const encoder = new TextEncoder();
    const passphraseBuffer = encoder.encode(passphrase);

    // Use a fixed salt for key derivation (in production, you might want to store this separately)
    const salt = encoder.encode("botnet-orchestrator-salt");

    // Import passphrase as key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passphraseBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    // Derive the actual AES key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000, // Good security practice
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    return derivedKey;
  }

  private generateRandomPassphrase(): string {
    // Generate a random 32-character passphrase using alphanumeric characters
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);

    for (let i = 0; i < 32; i++) {
      result += chars[array[i] % chars.length];
    }

    return result;
  }

  async encrypt(plaintext: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Encrypt
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        this.encryptionKey,
        data,
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // Return as base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error("Encryption failed:", error);
      throw new Error("Failed to encrypt secret");
    }
  }

  async decrypt(encryptedData: string): Promise<string> {
    await this.ensureInitialized();

    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    try {
      // Decode from base64
      const combined = Uint8Array.from(
        atob(encryptedData),
        (c) => c.charCodeAt(0),
      );

      // Extract IV (first 12 bytes) and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        this.encryptionKey,
        encrypted,
      );

      // Decode to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error("Decryption failed:", error);
      console.error("Encrypted data length:", encryptedData.length);
      console.error(
        "Encrypted data sample:",
        encryptedData.substring(0, 50) + "...",
      );
      throw new Error(`Failed to decrypt secret: ${(error as Error).message}`);
    }
  }

  async createSecret(request: CreateSecretRequest): Promise<Secret> {
    const encryptedValue = await this.encrypt(request.value);

    return {
      id: crypto.randomUUID(),
      name: request.name,
      description: request.description,
      value: encryptedValue,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: request.tags || [],
    };
  }

  async updateSecret(
    secret: Secret,
    request: UpdateSecretRequest,
  ): Promise<Secret> {
    const updated: Secret = {
      ...secret,
      updatedAt: new Date(),
    };

    if (request.name !== undefined) updated.name = request.name;
    if (request.description !== undefined) {
      updated.description = request.description;
    }
    if (request.tags !== undefined) updated.tags = request.tags;

    if (request.value !== undefined) {
      updated.value = await this.encrypt(request.value);
    }

    return updated;
  }

  async revealSecret(secret: Secret): Promise<string> {
    return await this.decrypt(secret.value);
  }

  // Interpolate secrets in config content
  async interpolateSecrets(
    content: string,
    secrets: Secret[],
  ): Promise<string> {
    let interpolated = content;

    for (const secret of secrets) {
      const decryptedValue = await this.decrypt(secret.value);
      const secretRef = `\${SECRET.${secret.name}}`;
      const secretRefAlt = `\${{SECRET.${secret.name}}}`;

      // Replace both ${SECRET.name} and ${{SECRET.name}} patterns
      interpolated = interpolated.replaceAll(secretRef, decryptedValue);
      interpolated = interpolated.replaceAll(secretRefAlt, decryptedValue);
    }

    return interpolated;
  }

  // Enhanced interpolation with agent-specific secret resolution
  async interpolateSecretsWithAgent(
    content: string,
    secrets: Secret[],
    agent?: { secretMapping?: Record<string, string> },
  ): Promise<string> {
    let interpolated = content;

    // Create a mapping for quick secret lookup by ID and name
    const secretById = new Map<string, Secret>();
    const secretByName = new Map<string, Secret>();

    for (const secret of secrets) {
      secretById.set(secret.id, secret);
      secretByName.set(secret.name, secret);
    }

    // Extract all secret references from content
    const references = this.extractSecretReferences(content);

    for (const refName of references) {
      let targetSecret: Secret | undefined;

      // Priority 1: Check agent's secret mapping for this variable
      if (agent?.secretMapping?.[refName]) {
        targetSecret = secretById.get(agent.secretMapping[refName]);
        console.log(
          `Agent secret mapping: ${refName} -> ${
            agent.secretMapping[refName]
          } -> ${targetSecret?.name || "NOT_FOUND"}`,
        );
      }

      // Priority 2: Fall back to global secret with matching name
      if (!targetSecret) {
        targetSecret = secretByName.get(refName);
        console.log(
          `Global secret fallback: ${refName} -> ${
            targetSecret?.name || "NOT_FOUND"
          }`,
        );
      }

      // Perform replacement if secret found
      if (targetSecret) {
        const decryptedValue = await this.decrypt(targetSecret.value);
        const secretRef = `\${SECRET.${refName}}`;
        const secretRefAlt = `\${{SECRET.${refName}}}`;

        interpolated = interpolated.replaceAll(secretRef, decryptedValue);
        interpolated = interpolated.replaceAll(secretRefAlt, decryptedValue);

        console.log(`✅ Resolved ${refName} using ${targetSecret.name}`);
      } else {
        console.warn(
          ` Secret variable ${refName} not found in agent mapping or global secrets`,
        );
      }
    }

    return interpolated;
  }

  // Extract secret references from config content
  extractSecretReferences(content: string): string[] {
    const references = new Set<string>();

    // Match ${SECRET.name} pattern
    const pattern1 = /\$\{SECRET\.([^}]+)\}/g;
    let match;
    while ((match = pattern1.exec(content)) !== null) {
      references.add(match[1]);
    }

    // Match ${{SECRET.name}} pattern
    const pattern2 = /\$\{\{SECRET\.([^}]+)\}\}/g;
    while ((match = pattern2.exec(content)) !== null) {
      references.add(match[1]);
    }

    return Array.from(references);
  }

  // Sanitize secret for safe display (remove value)
  sanitizeSecret(secret: Secret): Omit<Secret, "value"> {
    const { value, ...sanitized } = secret;
    return sanitized;
  }

  // Mask secret value for partial display
  maskSecretValue(value: string, visibleChars: number = 4): string {
    if (value.length <= visibleChars) {
      return "*".repeat(value.length);
    }
    return value.substring(0, visibleChars) +
      "*".repeat(Math.max(8, value.length - visibleChars));
  }
}
