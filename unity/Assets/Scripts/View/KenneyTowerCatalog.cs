using UnityEngine;

namespace GodTD.View
{
    /// <summary>
    /// Kenney Tower Defense Kit 프로토타입 매핑.
    /// 카탈로그 에셋이 FBX를 직접 참조하므로 원본이 Resources 밖에 있어도 빌드에 포함된다.
    /// </summary>
    [CreateAssetMenu(menuName = "GodTD/Kenney Tower Catalog")]
    public sealed class KenneyTowerCatalog : ScriptableObject
    {
        const string RESOURCE_PATH = "Prototype/KenneyTowerCatalog";

        [Tooltip("티어 0~4(GOD)에 대응하는 받침 모델")]
        public GameObject[] TierBases = new GameObject[5];

        [Tooltip("병과 0~3에 대응하는 무기 모델")]
        public GameObject[] RaceWeapons = new GameObject[4];

        static KenneyTowerCatalog cached;

        public static KenneyTowerCatalog Load()
        {
            if (cached == null) cached = Resources.Load<KenneyTowerCatalog>(RESOURCE_PATH);
            return cached;
        }

        public bool IsReady => TierBases != null && TierBases.Length >= 5 &&
            RaceWeapons != null && RaceWeapons.Length >= 4;

        /// <summary>원본 FBX 두 개를 자식으로 조립한다. 반환값은 로컬 높이다.</summary>
        public bool TryBuild(Transform parent, int race, int tier, out float height)
        {
            height = 0f;
            if (!IsReady) return false;

            int safeRace = Mathf.Clamp(race, 0, RaceWeapons.Length - 1);
            int safeTier = Mathf.Clamp(tier, 0, TierBases.Length - 1);
            var basePrefab = TierBases[safeTier];
            var weaponPrefab = RaceWeapons[safeRace];
            if (basePrefab == null || weaponPrefab == null) return false;

            var stand = Instantiate(basePrefab, parent, false);
            stand.name = $"Kenney Base T{safeTier + 1}";
            var standBounds = FitToFootprint(stand, parent, 0.86f, 0f);

            var weapon = Instantiate(weaponPrefab, parent, false);
            weapon.name = $"Kenney Weapon R{safeRace}";
            var weaponBounds = FitToFootprint(weapon, parent, 0.64f, 0f);
            float standTop = parent.InverseTransformPoint(standBounds.max).y;
            float weaponBottom = parent.InverseTransformPoint(weaponBounds.min).y;
            weapon.transform.localPosition += Vector3.up * (standTop - weaponBottom + 0.025f);

            var combined = WorldBounds(parent.gameObject);
            height = Mathf.Max(0.8f, parent.InverseTransformPoint(combined.max).y);
            return true;
        }

        static Bounds FitToFootprint(GameObject part, Transform parent, float footprint, float baseY)
        {
            part.transform.localPosition = Vector3.zero;
            part.transform.localRotation = Quaternion.identity;
            part.transform.localScale = Vector3.one;

            var bounds = WorldBounds(part);
            float width = Mathf.Max(bounds.size.x, bounds.size.z);
            if (width > 0.0001f)
                part.transform.localScale = Vector3.one * (footprint / width);

            bounds = WorldBounds(part);
            float bottom = parent.InverseTransformPoint(bounds.min).y;
            part.transform.localPosition += Vector3.up * (baseY - bottom);
            return WorldBounds(part);
        }

        static Bounds WorldBounds(GameObject root)
        {
            var renderers = root.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return new Bounds(root.transform.position, Vector3.zero);

            var bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            return bounds;
        }
    }
}
