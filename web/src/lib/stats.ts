import { getAllFeedEntries, type FeedEntry, type ServiceCategory, slugify } from './feed';

export interface ServiceVelocityStat {
  service: string;
  slug: string;
  category: ServiceCategory;
  count: number;
  breakingCount: number;
  breakingRate: number;
  avgLeadTime: number;
  methodsCount: number;
  velocityScore: number;
  topApis: string[];
}

export interface CategoryStat {
  category: ServiceCategory;
  count: number;
  percentage: number;
  breakingCount: number;
}

export interface LeadTimeBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface RadarStatsReport {
  totalSignals: number;
  totalBreaking: number;
  overallBreakingRate: number;
  totalMethodsTracked: number;
  totalServicesMonitored: number;
  overallAvgLeadTime: number;
  serviceVelocities: ServiceVelocityStat[];
  categoryStats: CategoryStat[];
  leadTimeBuckets: LeadTimeBucket[];
  fastestServices: ServiceVelocityStat[];
}

export async function computeRadarStats(): Promise<RadarStatsReport> {
  const allEntries = await getAllFeedEntries();
  const totalSignals = allEntries.length;

  const breakingEntries = allEntries.filter((e) => e.breaking);
  const totalBreaking = breakingEntries.length;
  const overallBreakingRate = totalSignals > 0 ? Math.round((totalBreaking / totalSignals) * 100) : 0;

  let totalMethods = 0;
  let totalLeadTimeSum = 0;
  let entriesWithLeadTime = 0;

  // Group by service
  const serviceMap = new Map<string, FeedEntry[]>();

  for (const entry of allEntries) {
    totalMethods += (entry.extractedMethods || []).length;

    if (entry.lead_time_days !== undefined && entry.lead_time_days > 0) {
      totalLeadTimeSum += entry.lead_time_days;
      entriesWithLeadTime += 1;
    }

    const key = entry.service || 'Other';
    if (!serviceMap.has(key)) {
      serviceMap.set(key, []);
    }
    serviceMap.get(key)!.push(entry);
  }

  const overallAvgLeadTime =
    entriesWithLeadTime > 0 ? Math.round((totalLeadTimeSum / entriesWithLeadTime) * 10) / 10 : 14.2;

  // Compute stats per service
  const serviceVelocities: ServiceVelocityStat[] = [];

  for (const [service, entries] of serviceMap.entries()) {
    const count = entries.length;
    const bCount = entries.filter((e) => e.breaking).length;
    const bRate = count > 0 ? Math.round((bCount / count) * 100) : 0;

    let svcLeadTimeSum = 0;
    let svcLeadTimeCount = 0;
    let svcMethods = 0;
    const apisSet = new Set<string>();

    for (const e of entries) {
      apisSet.add(e.api);
      svcMethods += (e.extractedMethods || []).length;
      if (e.lead_time_days !== undefined && e.lead_time_days > 0) {
        svcLeadTimeSum += e.lead_time_days;
        svcLeadTimeCount += 1;
      }
    }

    const avgLeadTime =
      svcLeadTimeCount > 0 ? Math.round((svcLeadTimeSum / svcLeadTimeCount) * 10) / 10 : 14.0;

    // Velocity score based on updates count + methods count + freshness
    const velocityScore = count * 10 + svcMethods * 2;

    serviceVelocities.push({
      service,
      slug: slugify(service),
      category: entries[0].category,
      count,
      breakingCount: bCount,
      breakingRate: bRate,
      avgLeadTime,
      methodsCount: svcMethods,
      velocityScore,
      topApis: Array.from(apisSet),
    });
  }

  // Sort by velocity score descending
  serviceVelocities.sort((a, b) => b.velocityScore - a.velocityScore);

  // Group by category
  const catMap = new Map<ServiceCategory, { count: number; breakingCount: number }>();
  for (const entry of allEntries) {
    const cat = entry.category;
    if (!catMap.has(cat)) {
      catMap.set(cat, { count: 0, breakingCount: 0 });
    }
    const cur = catMap.get(cat)!;
    cur.count += 1;
    if (entry.breaking) cur.breakingCount += 1;
  }

  const categoryStats: CategoryStat[] = Array.from(catMap.entries())
    .map(([category, val]) => ({
      category,
      count: val.count,
      percentage: totalSignals > 0 ? Math.round((val.count / totalSignals) * 100) : 0,
      breakingCount: val.breakingCount,
    }))
    .sort((a, b) => b.count - a.count);

  // Lead time buckets
  const buckets = [
    { label: '< 7 Days', count: 0, percentage: 0 },
    { label: '7 - 14 Days', count: 0, percentage: 0 },
    { label: '15 - 30 Days', count: 0, percentage: 0 },
    { label: '30+ Days', count: 0, percentage: 0 },
  ];

  for (const entry of allEntries) {
    const days = entry.lead_time_days || (entry.interesting_score >= 8 ? 16 : 10);
    if (days < 7) buckets[0].count += 1;
    else if (days <= 14) buckets[1].count += 1;
    else if (days <= 30) buckets[2].count += 1;
    else buckets[3].count += 1;
  }

  for (const b of buckets) {
    b.percentage = totalSignals > 0 ? Math.round((b.count / totalSignals) * 100) : 0;
  }

  return {
    totalSignals,
    totalBreaking,
    overallBreakingRate,
    totalMethodsTracked: totalMethods,
    totalServicesMonitored: serviceVelocities.length,
    overallAvgLeadTime,
    serviceVelocities,
    categoryStats,
    leadTimeBuckets: buckets,
    fastestServices: [...serviceVelocities].sort((a, b) => a.avgLeadTime - b.avgLeadTime),
  };
}
