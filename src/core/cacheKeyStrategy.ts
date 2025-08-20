interface CacheKeyOptions {
    city?: string;
    category?: string;
    location?: string;
    /**
     * Useful for prefixing cachekey
     */
    base?: `${string}:`;
  }
  
  interface NormalizedResult {
    cacheKey: string;
    normalizedTokens: string[];
    resolvedAliases: Record<string, string>;
  }
  
  class CacheKeyGenerator {
    private readonly stopWords = new Set([
      'market', 'mkt', 'plaza', 'place', 'center', 'centre', 'complex', 'mall',
      'shopping', 'store', 'shop', 'shops', 'stores', 'area', 'zone', 'district',
      'street', 'road', 'avenue', 'lane', 'close', 'crescent', 'way', 'drive',
      'junction', 'bus', 'stop', 'terminus', 'garage', 'park', 'gardens',
      'island', 'mainland', 'estate', 'phase', 'block', 'section', 'wing'
    ]);
  
    private readonly aliasMap = new Map<string, string>([
      // Lagos aliases
      ['eko', 'lagos'],
      ['lasgidi', 'lagos'],
      ['gidi', 'lagos'],
      ['naija', 'nigeria'],
      
      // Market-specific aliases with intelligent mappings
      ['balogun', 'balogun'],
      ['balogunmarket', 'balogun'],
      ['alaba', 'alaba'],
      ['alabamarket', 'alaba'],
      ['alaba_international', 'alaba_international'],
      ['alabainternational', 'alaba_international'],
      ['computer', 'computer_village'],
      ['computervillage', 'computer_village'],
      ['ikeja', 'ikeja'],
      ['ikejamarket', 'ikeja'],
      ['oyingbo', 'oyingbo'],
      ['oyingbomarket', 'oyingbo'],
      ['mushin', 'mushin'],
      ['mushinmarket', 'mushin'],
      ['mile12', 'mile_12'],
      ['mile_12', 'mile_12'],
      ['mile12market', 'mile_12'],
      ['ketu', 'ketu'],
      ['ketumarket', 'ketu'],
      ['agege', 'agege'],
      ['agegemarket', 'agege'],
      ['berger', 'berger'],
      ['bergermarket', 'berger'],
      ['oshodi', 'oshodi'],
      ['oshodimarket', 'oshodi'],
      ['tejuosho', 'tejuosho'],
      ['tejuoshomarket', 'tejuosho'],
      ['lawanson', 'lawanson'],
      ['lawansonmarket', 'lawanson'],
      ['cantonment', 'cantonment'],
      ['cantonmentmarket', 'cantonment'],
      ['apongbon', 'apongbon'],
      ['apongbonmarket', 'apongbon'],
      ['idumota', 'idumota'],
      ['idumotamarket', 'idumota'],
      ['sandgrouse', 'sandgrouse'],
      ['sandgrousemarket', 'sandgrouse'],
      ['ladipo', 'ladipo'],
      ['ladipomarket', 'ladipo'],
      ['gbagi', 'gbagi'],
      ['gbagimarket', 'gbagi'],
      
      // Abuja markets
      ['wuse', 'wuse'],
      ['wusemarket', 'wuse'],
      ['garki', 'garki'],
      ['garkimarket', 'garki'],
      ['kubwa', 'kubwa'],
      ['kubwamarket', 'kubwa'],
      ['nyanya', 'nyanya'],
      ['nyanyanmarket', 'nyanya'],
      ['karu', 'karu'],
      ['karumarket', 'karu'],
      ['gwagwalada', 'gwagwalada'],
      ['gwagwaladamarket', 'gwagwalada'],
      ['utako', 'utako'],
      ['utakomarket', 'utako'],
      ['maitama', 'maitama'],
      ['maitamamarkt', 'maitama'],
      
      // Port Harcourt
      ['mile1', 'mile_1'],
      ['mile_1', 'mile_1'],
      ['mile3', 'mile_3'],
      ['mile_3', 'mile_3'],
      ['rumuokoro', 'rumuokoro_market'],
      ['oyigbo', 'oyigbo_market'],
      ['eleme', 'eleme_market'],
      ['trans_amadi', 'trans_amadi'],
      ['diobu', 'diobu_market'],
      
      // Kano markets
      ['sabon_gari', 'sabon_gari'],
      ['kurmi', 'kurmi_market'],
      ['yankaba', 'yankaba_market'],
      ['kantin_kwari', 'kantin_kwari'],
      ['singer', 'singer_market'],
      
      // Ibadan markets
      ['gbagi', 'gbagi_market'],
      ['bodija', 'bodija_market'],
      ['oje', 'oje_market'],
      ['bere', 'bere_market'],
      ['gate', 'gate_market'],
      ['agodi_gate', 'agodi_gate'],
      ['challenge', 'challenge_market'],
      ['dugbe', 'dugbe_market'],
      
      // General location aliases
      ['vgc', 'victoria_garden_city'],
      ['vi', 'victoria_island'],
      ['lekki', 'lekki_peninsula'],
      ['ajah', 'ajah_market'],
      ['festac', 'festac_town'],
      ['surulere', 'surulere_market'],
      ['yaba', 'yaba_market'],
      ['palmgroove', 'palmgroove_market'],
      ['shomolu', 'shomolu_market'],
      ['bariga', 'bariga_market'],
      ['akoka', 'akoka_market'],
      ['anthony', 'anthony_village'],
      ['maryland', 'maryland_market'],
      ['ikotun', 'ikotun_market'],
      ['egbeda', 'egbeda_market'],
      ['dopemu', 'dopemu_market'],
      ['alakuko', 'alakuko_market'],
      ['iyana_ipaja', 'iyana_ipaja'],
      ['ayobo', 'ayobo_market'],
      
      // Specialized markets
      ['auto_parts', 'ladipo_auto_parts'],
      ['spare_parts', 'ladipo_auto_parts'],
      ['electronics', 'alaba_electronics'],
      ['phone', 'computer_village'],
      ['phones', 'computer_village'],
      ['laptop', 'computer_village'],
      ['computers', 'computer_village'],
      ['textiles', 'balogun_textiles'],
      ['fabric', 'balogun_textiles'],
      ['food', 'mile_12_food'],
      ['fruits', 'mile_12_food'],
      ['vegetables', 'mile_12_food'],
      
      // State aliases
      ['ph', 'port_harcourt'],
      ['portharcourt', 'port_harcourt'],
      ['fct', 'abuja'],
      ['kaduna', 'kaduna_market'],
      ['jos', 'jos_market'],
      ['warri', 'warri_market'],
      ['benin', 'benin_market'],
      ['enugu', 'enugu_market'],
      ['aba', 'aba_market'],
      ['onitsha', 'onitsha_market'],
      ['nnewi', 'nnewi_market'],
      ['awka', 'awka_market'],
      ['asaba', 'asaba_market'],
      ['calabar', 'calabar_market'],
      ['uyo', 'uyo_market'],
      ['maiduguri', 'maiduguri_market'],
      ['gombe', 'gombe_market'],
      ['bauchi', 'bauchi_market'],
      ['sokoto', 'sokoto_market'],
      ['kebbi', 'kebbi_market'],
      ['ilorin', 'ilorin_market'],
      ['akure', 'akure_market'],
      ['ado_ekiti', 'ado_ekiti_market'],
      ['osogbo', 'osogbo_market'],
      ['abeokuta', 'abeokuta_market'],
      ['lokoja', 'lokoja_market'],
      ['minna', 'minna_market'],
      ['makurdi', 'makurdi_market'],
      ['lafia', 'lafia_market'],
      ['yola', 'yola_market'],
      ['jalingo', 'jalingo_market'],
      ['gusau', 'gusau_market'],
      ['birnin_kebbi', 'birnin_kebbi_market'],
      ['dutse', 'dutse_market'],
      ['katsina', 'katsina_market'],
      ['damaturu', 'damaturu_market'],
      ['potiskum', 'potiskum_market']
    ]);
  
    private readonly punctuationRegex = /[^\w\s]/g;
    private readonly whitespaceRegex = /\s+/g;
    private readonly numberRegex = /\d+/g;
  
    /**
     * Tokenizes and normalizes search terms with optimized string operations
     */
    private tokenize(input: string): string[] {
      if (!input || typeof input !== 'string') return [];
      
      // Single pass normalization: lowercase, remove punctuation, normalize whitespace
      const normalized = input
        .toLowerCase()
        .replace(this.punctuationRegex, ' ')
        .replace(this.whitespaceRegex, ' ')
        .trim();
  
      if (!normalized) return [];
  
      // Split and filter in one pass
      const tokens = normalized.split(' ').filter(token => {
        return token.length > 0 && !this.stopWords.has(token);
      });
  
      // Remove duplicates while preserving order using Set
      return [...new Set(tokens)];
    }
  
    /**
     * Resolves aliases with intelligent duplicate detection
     */
    private resolveAliases(tokens: string[]): { 
      resolved: string[], 
      aliasMap: Record<string, string> 
    } {
      const resolved: string[] = [];
      const usedAliases: Record<string, string> = {};
      const seenTokens = new Set<string>();
  
      for (const token of tokens) {
        const alias = this.aliasMap.get(token);
        const finalToken = alias || token;
        
        // Handle alias resolution with duplicate detection
        if (alias) {
          usedAliases[token] = alias;
          
          // Split alias to check for internal duplicates
          const aliasParts = alias.split('_');
          const uniqueParts = [];
          const partsSeen = new Set<string>();
          
          for (const part of aliasParts) {
            if (!partsSeen.has(part) && !seenTokens.has(part)) {
              uniqueParts.push(part);
              partsSeen.add(part);
              seenTokens.add(part);
            }
          }
          
          if (uniqueParts.length > 0) {
            resolved.push(uniqueParts.join('_'));
          }
        } else {
          // Only add if we haven't seen this token or its parts
          if (!seenTokens.has(token)) {
            // Check if this token is a substring of any already resolved token
            const isSubstring = resolved.some(existingToken => 
              existingToken.includes(token) || token.includes(existingToken)
            );
            
            if (!isSubstring) {
              resolved.push(token);
              seenTokens.add(token);
            }
          }
        }
      }
  
      return { resolved, aliasMap: usedAliases };
    }
  
    /**
     * Normalizes final resolved tokens to remove redundancies
     */
    private normalizeResolvedTokens(tokens: string[]): string[] {
      if (tokens.length <= 1) return tokens;
      
      const normalized = new Set<string>();
      const tokenParts = new Map<string, Set<string>>();
      
      // First pass: collect all token parts
      for (const token of tokens) {
        const parts = token.split('_');
        tokenParts.set(token, new Set(parts));
      }
      
      // Second pass: identify non-redundant tokens
      for (const [token, parts] of tokenParts) {
        let isRedundant = false;
        
        // Check if this token is completely contained in another token
        for (const [otherToken, otherParts] of tokenParts) {
          if (token !== otherToken && otherParts.size > parts.size) {
            const isSubset = [...parts].every(part => otherParts.has(part));
            if (isSubset) {
              isRedundant = true;
              break;
            }
          }
        }
        
        if (!isRedundant) {
          normalized.add(token);
        }
      }
      
      return Array.from(normalized);
    }
    generateCacheKey(searchTerm: string, options?: CacheKeyOptions): string {
      const tokens = this.tokenize(searchTerm);
      if (tokens.length === 0) return 'market:empty';
  
      const { resolved } = this.resolveAliases(tokens);
      
      // Sort tokens for consistent key generation
      const sortedTokens = resolved.sort();
      
      // Build cache key with optional context
      const contextParts: string[] = [];
      if (options?.city) contextParts.push(`city:${this.tokenize(options.city).join('_')}`);
      if (options?.category) contextParts.push(`cat:${this.tokenize(options.category).join('_')}`);
      if (options?.location) contextParts.push(`loc:${this.tokenize(options.location).join('_')}`);
  
      const baseKey = sortedTokens.join('_');
      const contextKey = contextParts.length > 0 ? `_${contextParts.join('_')}` : '';
      
      return `${options.base ?? "market:"}${baseKey}${contextKey}`;
    }
  
    /**
     * Generates detailed normalization result with metadata
     */
    generateNormalizedResult(searchTerm: string, options?: CacheKeyOptions): NormalizedResult {
      const tokens = this.tokenize(searchTerm);
      const { resolved, aliasMap } = this.resolveAliases(tokens);
      const normalized = this.normalizeResolvedTokens(resolved);
      const cacheKey = this.generateCacheKey(searchTerm, options);
  
      return {
        cacheKey,
        normalizedTokens: normalized.sort(),
        resolvedAliases: aliasMap
      };
    }
  
    /**
     * Batch processing for multiple search terms
     */
    generateBatchCacheKeys(searchTerms: string[], options?: CacheKeyOptions): Record<string, string> {
      const result: Record<string, string> = {};
      for (const term of searchTerms) {
        result[term] = this.generateCacheKey(term, options);
      }
      return result;
    }
  
    /**
     * Get similar cache keys for fuzzy matching
     */
    getSimilarCacheKeys(searchTerm: string, options?: CacheKeyOptions): string[] {
      const baseResult = this.generateNormalizedResult(searchTerm, options);
      const tokens = baseResult.normalizedTokens;
      
      if (tokens.length <= 1) return [baseResult.cacheKey];
      
      const variations: Set<string> = new Set([baseResult.cacheKey]);
      
      // Generate permutations for small token sets
      if (tokens.length <= 3) {
        const permutations = this.getPermutations(tokens);
        for (const perm of permutations) {
          const key = `market:${perm.join('_')}`;
          variations.add(options ? this.addContext(key, options) : key);
        }
      }
      
      // Generate partial matches
      for (let i = 1; i < tokens.length; i++) {
        const partial = tokens.slice(0, i).sort();
        const key = `market:${partial.join('_')}`;
        variations.add(options ? this.addContext(key, options) : key);
      }
      
      return Array.from(variations);
    }
  
    private addContext(baseKey: string, options: CacheKeyOptions): string {
      const contextParts: string[] = [];
      if (options.city) contextParts.push(`city:${this.tokenize(options.city).join('_')}`);
      if (options.category) contextParts.push(`cat:${this.tokenize(options.category).join('_')}`);
      if (options.location) contextParts.push(`loc:${this.tokenize(options.location).join('_')}`);
      
      return contextParts.length > 0 ? `${baseKey}_${contextParts.join('_')}` : baseKey;
    }
  
    private getPermutations(arr: string[]): string[][] {
      if (arr.length <= 1) return [arr];
      const result: string[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        const perms = this.getPermutations(rest);
        for (const perm of perms) {
          result.push([arr[i], ...perm]);
        }
      }
      return result;
    }
  }
  
  // Singleton instance for optimal performance
  const cacheKeyGenerator = new CacheKeyGenerator();
  
  // Primary export function
  export const generateCacheKey = (searchTerm: string, options?: CacheKeyOptions): string => {
    return cacheKeyGenerator.generateCacheKey(searchTerm, options);
  };
  
  // Additional utility exports
  export const generateNormalizedResult = (searchTerm: string, options?: CacheKeyOptions): NormalizedResult => {
    return cacheKeyGenerator.generateNormalizedResult(searchTerm, options);
  };
  
  export const generateBatchCacheKeys = (searchTerms: string[], options?: CacheKeyOptions): Record<string, string> => {
    return cacheKeyGenerator.generateBatchCacheKeys(searchTerms, options);
  };
  
  export const getSimilarCacheKeys = (searchTerm: string, options?: CacheKeyOptions): string[] => {
    return cacheKeyGenerator.getSimilarCacheKeys(searchTerm, options);
  };
  
  // Type exports
  export type { CacheKeyOptions, NormalizedResult };
  
  // Default export
  export default {
    generateCacheKey,
    generateNormalizedResult,
    generateBatchCacheKeys,
    getSimilarCacheKeys
  };