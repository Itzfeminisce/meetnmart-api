import { EventEmitter } from 'events';

// Core Types
export type UserType = 'seller' | 'buyer' | 'deliveryAgent';
export type TierLevel = 'free' | 'basic' | 'pro' | 'elite';
export type SupportPriority = 'community' | 'standard' | 'priority' | 'dedicated';
export type RegionalScope = 'local' | 'state' | 'neighboring_states';

// Configuration Interfaces
export interface BaseTierConfig {
  label: string;
  monthlyFee?: number;
  requiresVerificationAbove: number;
  fees: {
    platformChargePercent?: number;
    platformCommissionPercent?: number;
    platformFeePercent?: number;
    withdrawalFeeFixed: number;
    withdrawalFeePercent: number;
    paymentProviderSurchargePercent?: number;
  };
  support: {
    priority: SupportPriority;
    responseTimeHours: number;
    hasLiveChat?: boolean;
    hasDedicatedManager?: boolean;
  };
}

export interface SellerTierConfig extends BaseTierConfig {
  visibilityRadiusKm: number;
  maxListings: number;
  maxRequestAmount: number;
  monthlyRequestCap: number;
  regionalVisibility: RegionalScope[];
  boostable: boolean;
  priorityInSearch: number;
  canScheduleListings: boolean;
  maxPhotosPerListing: number;
  canUseAnalytics: boolean;
  canUsePromotionalTools?: boolean;
  hasAdvancedAnalytics?: boolean;
}

export interface BuyerTierConfig extends BaseTierConfig {
  searchRadiusKm: number;
  maxPaymentPerTransaction: number;
  monthlyPaymentCap: number;
  canSaveWishlist: boolean;
  maxWishlistItems: number;
  canTrackOrders: boolean;
  hasExtendedWarranty: boolean;
  hasPrioritySupport?: boolean;
  hasPersonalShopper?: boolean;
}

export interface DeliveryAgentTierConfig extends BaseTierConfig {
  serviceRadiusKm: number;
  maxTransportableValue: number;
  monthlyTransportCap: number;
  maxDeliveriesPerDay: number;
  regionalEligibility: RegionalScope[];
  boostable: boolean;
  canChooseDeliverySlots: boolean;
  hasInsuranceCoverage: boolean;
  insuranceCoverageAmount?: number;
  priorityInMatching: number;
  canHandleFragileItems?: boolean;
  canHandleSpecializedDelivery?: boolean;
}

export interface UpgradeRequirement {
  minCompletedTransactions?: number;
  minCompletedPurchases?: number;
  minCompletedDeliveries?: number;
  minRating: number;
  accountAgeMonths: number;
  monthlyRevenueThreshold?: number;
  monthlySpendingThreshold?: number;
  monthlyDeliveryValueThreshold?: number;
}

export interface TierConfiguration {
  sellerTiers: Record<TierLevel, SellerTierConfig>;
  buyerTiers: Record<TierLevel, BuyerTierConfig>;
  deliveryAgentTiers: Record<TierLevel, DeliveryAgentTierConfig>;
  tierUpgradeRequirements: Record<UserType, Record<Exclude<TierLevel, 'free'>, UpgradeRequirement>>;
  globalSettings: {
    currency: string;
    minimumKYCThreshold: number;
    platformInsuranceMaxCoverage: number;
    disputeResolutionTimeframeDays: number;
    refundProcessingDays: number;
  };
}

// User Data Interface
export interface UserProfile {
  id: string;
  type: UserType;
  currentTier: TierLevel;
  accountCreatedAt: Date;
  isKYCVerified: boolean;
  rating?: number;
  completedTransactions?: number;
  completedPurchases?: number;
  completedDeliveries?: number;
  monthlyRevenue?: number;
  monthlySpending?: number;
  monthlyDeliveryValue?: number;
  lastBillingDate?: Date;
  coordinates?: { lat: number; lng: number };
}

// Validation Results
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  suggestions?: string[];
  requiresKYC?: boolean;
  maxAllowedAmount?: number;
}

export interface UpgradeEligibility {
  isEligible: boolean;
  nextTier?: TierLevel;
  missingRequirements?: string[];
  recommendations?: string[];
}

// Events
export interface TierManagerEvents {
  'transaction-blocked': { user: UserProfile; amount: number; reason: string };
  'kyc-required': { userId: string; amount: number; threshold: number };
  'tier-upgrade-eligible': { userId: string; currentTier: TierLevel; eligibleTier: TierLevel };
  'monthly-cap-approached': { userId: string; currentUsage: number; cap: number; percentage: number };
  'fee-calculated': { userId: string; transactionAmount: number; totalFees: number; breakdown: Record<string, number> };
}

export class MeetnMartTierManager extends EventEmitter {
  private config: TierConfiguration;
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(config: TierConfiguration) {
    super();
    this.validateConfiguration(config);
    this.config = structuredClone(config);
  }

  // Configuration Management
  public updateConfiguration(newConfig: Partial<TierConfiguration>): void {
    this.validateConfiguration({ ...this.config, ...newConfig } as TierConfiguration);
    this.config = { ...this.config, ...newConfig };
    this.clearCache();
  }

  public getConfiguration(): Readonly<TierConfiguration> {
    return structuredClone(this.config);
  }

  // User Tier Information
  public getUserTierConfig<T extends UserType>(
    userType: T,
    tierLevel: TierLevel
  ): T extends 'seller' ? SellerTierConfig : T extends 'buyer' ? BuyerTierConfig : DeliveryAgentTierConfig {
    const configKey = `${userType}Tiers` as const;
    return structuredClone(this.config[configKey][tierLevel]) as any;
  }

  // Transaction Validation
  public validateTransaction(user: UserProfile, amount: number, currentMonthlyUsage: number = 0): ValidationResult {
    const cacheKey = `validate_${user.id}_${amount}_${currentMonthlyUsage}`;
    const cached = this.getCached<ValidationResult>(cacheKey);
    if (cached) return cached;

    const tierConfig = this.getUserTierConfig(user.type, user.currentTier);
    const result = this.performTransactionValidation(user, amount, currentMonthlyUsage, tierConfig);
    
    this.setCached(cacheKey, result);
    
    if (!result.isValid) {
      this.emit('transaction-blocked', { user, amount, reason: result.reason! });
    }
    
    if (result.requiresKYC) {
      this.emit('kyc-required', { 
        userId: user.id, 
        amount, 
        threshold: tierConfig.requiresVerificationAbove 
      });
    }

    return result;
  }

  private performTransactionValidation(
    user: UserProfile, 
    amount: number, 
    currentMonthlyUsage: number,
    tierConfig: any
  ): ValidationResult {
    // KYC Check
    const requiresKYC = amount > tierConfig.requiresVerificationAbove && !user.isKYCVerified;
    if (requiresKYC) {
      return {
        isValid: false,
        reason: `Transaction amount ₦${amount.toLocaleString()} exceeds verification threshold of ₦${tierConfig.requiresVerificationAbove.toLocaleString()}`,
        suggestions: ['Complete KYC verification to proceed with this transaction'],
        requiresKYC: true,
        maxAllowedAmount: tierConfig.requiresVerificationAbove
      };
    }

    // Single Transaction Limit
    const maxSingleAmount = this.getMaxTransactionAmount(user.type, tierConfig);
    if (amount > maxSingleAmount) {
      return {
        isValid: false,
        reason: `Transaction amount ₦${amount.toLocaleString()} exceeds single transaction limit of ₦${maxSingleAmount.toLocaleString()}`,
        suggestions: [
          `Split transaction into smaller amounts (max ₦${maxSingleAmount.toLocaleString()})`,
          `Upgrade to ${this.getNextTierName(user.currentTier)} for higher limits`
        ],
        maxAllowedAmount: maxSingleAmount
      };
    }

    // Monthly Cap Check
    const monthlyCap = this.getMonthlyCap(user.type, tierConfig);
    const projectedUsage = currentMonthlyUsage + amount;
    
    if (projectedUsage > monthlyCap) {
      const remaining = Math.max(0, monthlyCap - currentMonthlyUsage);
      return {
        isValid: false,
        reason: `Transaction would exceed monthly limit. Available: ₦${remaining.toLocaleString()}, Required: ₦${amount.toLocaleString()}`,
        suggestions: [
          'Wait for next billing cycle',
          `Upgrade to ${this.getNextTierName(user.currentTier)} for higher monthly limits`,
          remaining > 0 ? `Maximum transaction possible: ₦${remaining.toLocaleString()}` : 'Monthly limit fully utilized'
        ].filter(Boolean),
        maxAllowedAmount: remaining
      };
    }

    // Monthly Cap Warning (80% threshold)
    const usagePercentage = (projectedUsage / monthlyCap) * 100;
    if (usagePercentage >= 80) {
      this.emit('monthly-cap-approached', {
        userId: user.id,
        currentUsage: projectedUsage,
        cap: monthlyCap,
        percentage: usagePercentage
      });
    }

    return { isValid: true };
  }

  // Geographic Validation
  public validateGeographicAccess(
    sellerLocation: { lat: number; lng: number },
    buyerLocation: { lat: number; lng: number },
    sellerTier: TierLevel
  ): ValidationResult {
    const sellerConfig = this.getUserTierConfig('seller', sellerTier);
    const distance = this.calculateDistance(sellerLocation, buyerLocation);
    
    if (distance > sellerConfig.visibilityRadiusKm) {
      return {
        isValid: false,
        reason: `Seller is ${distance.toFixed(1)}km away, outside visibility radius of ${sellerConfig.visibilityRadiusKm}km`,
        suggestions: [
          'Search for sellers closer to your location',
          'Contact seller to inquire about extended delivery options'
        ]
      };
    }

    return { isValid: true };
  }

  // Fee Calculations
  public calculateFees(user: UserProfile, transactionAmount: number): {
    platformFee: number;
    withdrawalFee: number;
    paymentProcessorFee: number;
    totalFees: number;
    breakdown: Record<string, number>;
  } {
    const tierConfig = this.getUserTierConfig(user.type, user.currentTier);
    const fees = tierConfig.fees;
    
    const platformFee = this.calculatePlatformFee(user.type, fees, transactionAmount);
    const withdrawalFee = fees.withdrawalFeeFixed + (transactionAmount * fees.withdrawalFeePercent / 100);
    const paymentProcessorFee = fees.paymentProviderSurchargePercent 
      ? transactionAmount * fees.paymentProviderSurchargePercent / 100 
      : 0;
    
    const totalFees = platformFee + withdrawalFee + paymentProcessorFee;
    
    const breakdown = {
      platformFee,
      withdrawalFee,
      paymentProcessorFee,
      monthlySubscription: tierConfig.monthlyFee || 0
    };

    this.emit('fee-calculated', {
      userId: user.id,
      transactionAmount,
      totalFees,
      breakdown
    });

    return {
      platformFee,
      withdrawalFee,
      paymentProcessorFee,
      totalFees,
      breakdown
    };
  }

  // Upgrade Eligibility
  public checkUpgradeEligibility(user: UserProfile): UpgradeEligibility {
    const cacheKey = `upgrade_${user.id}`;
    const cached = this.getCached<UpgradeEligibility>(cacheKey);
    if (cached) return cached;

    if (user.currentTier === 'elite') {
      return { isEligible: false };
    }

    const nextTier = this.getNextTier(user.currentTier);
    const requirements = this.config.tierUpgradeRequirements[user.type][nextTier];
    
    const result = this.evaluateUpgradeRequirements(user, requirements, nextTier);
    this.setCached(cacheKey, result);

    if (result.isEligible) {
      this.emit('tier-upgrade-eligible', {
        userId: user.id,
        currentTier: user.currentTier,
        eligibleTier: nextTier
      });
    }

    return result;
  }

  private evaluateUpgradeRequirements(
    user: UserProfile, 
    requirements: UpgradeRequirement, 
    nextTier: TierLevel
  ): UpgradeEligibility {
    const missing: string[] = [];
    const recommendations: string[] = [];

    // Account Age
    const accountAgeMonths = this.getAccountAgeInMonths(user.accountCreatedAt);
    if (accountAgeMonths < requirements.accountAgeMonths) {
      missing.push(`Account age: ${accountAgeMonths}/${requirements.accountAgeMonths} months`);
      recommendations.push(`Wait ${requirements.accountAgeMonths - accountAgeMonths} more months`);
    }

    // Rating
    if (user.rating && user.rating < requirements.minRating) {
      missing.push(`Rating: ${user.rating.toFixed(1)}/${requirements.minRating} stars`);
      recommendations.push('Improve service quality to increase rating');
    }

    // Transaction Count
    const transactionField = this.getTransactionField(user.type);
    const userTransactions = user[transactionField] || 0;
    // @ts-ignore
    const requiredTransactions = requirements[transactionField] || 0;
    
    if (userTransactions < requiredTransactions) {
      missing.push(`Transactions: ${userTransactions}/${requiredTransactions}`);
      // @ts-ignore
      recommendations.push(`Complete ${requiredTransactions - userTransactions} more transactions`);
    }

    // Revenue/Spending Threshold
    const thresholdField = this.getThresholdField(user.type);
    if (requirements[thresholdField]) {
      const userAmount = user[this.getUserAmountField(user.type)] || 0;
      const requiredAmount = requirements[thresholdField]!;
      
      // @ts-ignore
      if (userAmount < requiredAmount) {
        missing.push(`Monthly volume: ₦${userAmount.toLocaleString()}/₦${requiredAmount.toLocaleString()}`);
        recommendations.push(`Increase monthly activity to reach ₦${requiredAmount.toLocaleString()}`);
      }
    }

    return {
      isEligible: missing.length === 0,
      nextTier: nextTier,
      missingRequirements: missing.length > 0 ? missing : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined
    };
  }

  // Performance Optimizations
  public preloadUserConfigurations(userIds: string[]): void {
    // Batch preload commonly accessed configurations
    const tiers: TierLevel[] = ['free', 'basic', 'pro', 'elite'];
    const userTypes: UserType[] = ['seller', 'buyer', 'deliveryAgent'];
    
    userTypes.forEach(type => {
      tiers.forEach(tier => {
        const cacheKey = `config_${type}_${tier}`;
        this.setCached(cacheKey, this.getUserTierConfig(type, tier));
      });
    });
  }

  // Utility Methods
  private validateConfiguration(config: TierConfiguration): void {
    if (!config.sellerTiers || !config.buyerTiers || !config.deliveryAgentTiers) {
      throw new Error('Invalid configuration: missing required tier definitions');
    }

    // Validate tier progression logic
    const tiers: TierLevel[] = ['free', 'basic', 'pro', 'elite'];
    
    ['sellerTiers', 'buyerTiers', 'deliveryAgentTiers'].forEach(tierType => {
      tiers.forEach(tier => {
        // @ts-ignore
        if (!config[tierType as keyof TierConfiguration][tier]) {
          throw new Error(`Missing ${tier} configuration for ${tierType}`);
        }
      });
    });
  }

  private calculateDistance(point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private getMaxTransactionAmount(userType: UserType, tierConfig: any): number {
    switch (userType) {
      case 'seller': return tierConfig.maxRequestAmount;
      case 'buyer': return tierConfig.maxPaymentPerTransaction;
      case 'deliveryAgent': return tierConfig.maxTransportableValue;
    }
  }

  private getMonthlyCap(userType: UserType, tierConfig: any): number {
    switch (userType) {
      case 'seller': return tierConfig.monthlyRequestCap;
      case 'buyer': return tierConfig.monthlyPaymentCap;
      case 'deliveryAgent': return tierConfig.monthlyTransportCap;
    }
  }

  private calculatePlatformFee(userType: UserType, fees: any, amount: number): number {
    if (fees.platformChargePercent) return amount * fees.platformChargePercent / 100;
    if (fees.platformCommissionPercent) return amount * fees.platformCommissionPercent / 100;
    if (fees.platformFeePercent) return amount * fees.platformFeePercent / 100;
    return 0;
  }

  private getNextTier(currentTier: TierLevel): Exclude<TierLevel, 'free'> {
    const progression: Record<TierLevel, Exclude<TierLevel, 'free'>> = {
      free: 'basic',
      basic: 'pro',
      pro: 'elite',
      elite: 'elite'
    };
    return progression[currentTier];
  }

  private getNextTierName(currentTier: TierLevel): string {
    const names: Record<TierLevel, string> = {
      free: 'Basic',
      basic: 'Pro',
      pro: 'Elite',
      elite: 'Elite'
    };
    return names[this.getNextTier(currentTier)];
  }

  private getAccountAgeInMonths(createdAt: Date): number {
    const now = new Date();
    const yearsDiff = now.getFullYear() - createdAt.getFullYear();
    const monthsDiff = now.getMonth() - createdAt.getMonth();
    return yearsDiff * 12 + monthsDiff;
  }

  private getTransactionField(userType: UserType): keyof UserProfile {
    switch (userType) {
      case 'seller': return 'completedTransactions';
      case 'buyer': return 'completedPurchases';
      case 'deliveryAgent': return 'completedDeliveries';
    }
  }

  private getThresholdField(userType: UserType): keyof UpgradeRequirement {
    switch (userType) {
      case 'seller': return 'monthlyRevenueThreshold';
      case 'buyer': return 'monthlySpendingThreshold';
      case 'deliveryAgent': return 'monthlyDeliveryValueThreshold';
    }
  }

  private getUserAmountField(userType: UserType): keyof UserProfile {
    switch (userType) {
      case 'seller': return 'monthlyRevenue';
      case 'buyer': return 'monthlySpending';
      case 'deliveryAgent': return 'monthlyDeliveryValue';
    }
  }

  // Caching
  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCached<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private clearCache(): void {
    this.cache.clear();
  }

  // Cleanup
  public destroy(): void {
    this.clearCache();
    this.removeAllListeners();
  }
}


/**
 * Examle Usage
 */

// Initialize
// const tierManager = new MeetnMartTierManager(config);

// // Listen to events
// tierManager.on('transaction-blocked', ({ user, reason }) => {
//   logger.warn(`Transaction blocked for ${user.id}: ${reason}`);
// });

// // Validate transaction
// const validation = tierManager.validateTransaction(user, 50000, currentMonthlyUsage);
// if (!validation.isValid) {
//   return { error: validation.reason, suggestions: validation.suggestions };
// }

// // Calculate fees
// const fees = tierManager.calculateFees(user, 50000);

// // Check upgrade eligibility
// const upgrade = tierManager.checkUpgradeEligibility(user);