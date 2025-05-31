# Trending Markets Configuration Guide

## Overview
The `getTopTrendingMarkets` function calculates a "trending score" for each market based on various factors. Higher scores indicate more trending markets. This guide explains each configuration option and its impact.

---

## Configuration Structure

```javascript
const config = {
    // Filter Settings
    filterField: 'belongs_to_market',
    filterValue: true,
    topCount: 5,
    
    // Scoring Weights
    weights: { ... },
    
    // Field Mappings
    fields: { ... },
    
    // Output Settings
    includeScore: true,
    returnFields: null
};
```

---

## Filter Settings

### `filterField` (string)
**What it does:** Specifies which field to use for filtering the data  
**Default:** `'belongs_to_market'`  
**Effect:** Only items where this field matches `filterValue` will be analyzed  
**Example:** 
- `filterField: 'category'` - filter by category field
- `filterField: null` - no filtering, analyze all items

### `filterValue` (any)
**What it does:** The value that `filterField` must equal for items to be included  
**Default:** `true`  
**Effect:** Combined with `filterField` to create filter criteria  
**Example:**
- `filterValue: 'restaurant'` - only restaurants
- `filterValue: null` - disable filtering

### `topCount` (number)
**What it does:** How many top trending items to return  
**Default:** `5`  
**Effect:** Controls the size of your results array  
**Example:** `topCount: 10` returns top 10 instead of top 5

---

## Scoring Weights

These determine how much each factor contributes to the trending score. Higher weights = more important.

### `last_24hrs` (number)
**What it does:** Bonus points if the market was active in the last 24 hours  
**Default:** `50`  
**Data field:** Boolean (`true`/`false`)  
**Effect:** Markets active recently get this many points added  
**Use case:** Emphasize very recent activity

### `updated_recently` (number)
**What it does:** Bonus points if the market data was updated recently  
**Default:** `30`  
**Data field:** Boolean (`true`/`false`)  
**Effect:** Recently updated markets get this many points  
**Use case:** Favor markets with fresh information

### `impressions_per_user` (number)
**What it does:** Multiplier for the engagement rate (impressions ÷ users)  
**Default:** `10`  
**Data field:** Number (calculated: `impressions / user_count`)  
**Effect:** Higher engagement rates get proportionally more points  
**Use case:** Identify markets that captivate users

### `impressions` (number)
**What it does:** Multiplier for total impression count  
**Default:** `2`  
**Data field:** Number (total views/visits)  
**Effect:** Markets with more total views score higher  
**Use case:** Reward overall popularity

### `user_count` (number)
**What it does:** Multiplier for number of unique users  
**Default:** `5`  
**Data field:** Number (unique visitors)  
**Effect:** Markets attracting more people score higher  
**Use case:** Measure reach and appeal

### `recent_count` (number)
**What it does:** Multiplier for recent activity count  
**Default:** `3`  
**Data field:** Number (recent interactions/visits)  
**Effect:** More recent activity = higher score  
**Use case:** Capture current momentum

### `age_penalty_factor` (number)
**What it does:** How much to penalize older entries  
**Default:** `1`  
**Calculation:** `(age_hours / 24) * age_penalty_factor`  
**Effect:** Higher values penalize age more severely  
**Use case:** Control how much freshness matters

### `max_age_penalty` (number)
**What it does:** Maximum penalty points for age  
**Default:** `24`  
**Effect:** Caps the age penalty so very old items aren't overly penalized  
**Use case:** Prevent age from completely eliminating good markets

---

## Field Mappings

Use this when your data has different field names than expected.

### `fields` object
**What it does:** Maps expected field names to your actual field names  
**Default:** All fields map to themselves  
**Effect:** Allows the function to work with different data structures  

**Available mappings:**
- `last_24hrs`: Field indicating recent activity (boolean)
- `updated_recently`: Field indicating recent updates (boolean)  
- `impressions_per_user`: Engagement rate field (number)
- `impressions`: Total impressions field (number)
- `user_count`: User count field (number)
- `recent_count`: Recent activity count field (number)
- `age_hours`: Age in hours field (number)
- `filter_field`: Field used for filtering

**Example:**
```javascript
fields: {
    user_count: 'total_users',
    impressions: 'total_views',
    last_24hrs: 'active_today'
}
```

---

## Output Settings

### `includeScore` (boolean)
**What it does:** Whether to include the calculated trending score in results  
**Default:** `true`  
**Effect:** When `true`, adds `trending_score` field to each result  
**Use case:** Turn off if you only want ranking without showing scores

### `returnFields` (array or null)
**What it does:** Specify which fields to include in results  
**Default:** `null` (return all fields)  
**Effect:** When array provided, only those fields are returned  
**Example:** `['name', 'address', 'trending_score']` for minimal output

---

## Scoring Algorithm Explained

### Step 1: Base Score Calculation
```
score = 0
if (last_24hrs) score += weight_last_24hrs
if (updated_recently) score += weight_updated_recently
score += impressions_per_user * weight_impressions_per_user
score += impressions * weight_impressions
score += user_count * weight_user_count  
score += recent_count * weight_recent_count
```

### Step 2: Age Penalty
```
age_penalty = min((age_hours / 24) * age_penalty_factor, max_age_penalty)
score -= age_penalty
```

### Step 3: Final Score
```
final_score = max(0, score)  // Ensure non-negative
```

---

## Practical Examples

### Scenario 1: Find Recently Hot Markets
```javascript
const recentHot = getTopTrendingMarkets(data, {
    weights: {
        last_24hrs: 100,      // Very important
        updated_recently: 50,  // Important  
        recent_count: 20,     // Important
        impressions_per_user: 5, // Less important
        age_penalty_factor: 3  // Heavily penalize age
    }
});
```

### Scenario 2: Find Consistently Popular Markets
```javascript
const consistent = getTopTrendingMarkets(data, {
    weights: {
        impressions: 10,       // Total popularity
        user_count: 15,        // Broad appeal
        impressions_per_user: 5, // Moderate engagement
        last_24hrs: 10,        // Recent activity less critical
        age_penalty_factor: 0.5 // Don't penalize age much
    }
});
```

### Scenario 3: Find High-Engagement Markets
```javascript
const engaging = getTopTrendingMarkets(data, {
    weights: {
        impressions_per_user: 30, // Primary factor
        recent_count: 10,         // Supporting factor
        last_24hrs: 20,           // Recent engagement
        impressions: 1,           // Total volume less important
        user_count: 2             // Reach less important
    }
});
```

---

## Tips for Tuning

### Understanding Weight Relationships
- **Absolute values matter:** Weight of 50 vs 10 means 5x more important
- **Relative values matter:** If all weights are high, age penalty becomes less significant
- **Balance is key:** Very high weights on one factor can dominate others

### Common Weight Patterns
- **Recency-focused:** High `last_24hrs`, `updated_recently`, `age_penalty_factor`
- **Popularity-focused:** High `impressions`, `user_count`, low `age_penalty_factor`  
- **Engagement-focused:** High `impressions_per_user`, `recent_count`
- **Balanced:** Moderate values across all factors

### Testing Your Configuration
1. Start with default weights
2. Adjust one weight at a time
3. Test with known data to validate results
4. Use different presets for comparison
5. Monitor results over time to refine

---

## Preset Configurations Explained

### `recentActivity`
**Best for:** Finding markets with recent spikes in activity  
**Characteristics:** Heavy weight on recent factors, penalizes age significantly

### `userEngagement`  
**Best for:** Finding markets that captivate users regardless of when  
**Characteristics:** Emphasizes per-user metrics, less concerned with recency

### `balanced`
**Best for:** General-purpose trending detection  
**Characteristics:** Moderate weights across all factors

### `top10Minimal`
**Best for:** Quick overview with essential info only  
**Characteristics:** Returns more results with fewer fields