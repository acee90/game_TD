// 로우폴리 유닛용 셰이더 — 정점 색 × 조명.
//
// 왜 필요한가: 유닛 하나는 몸통·머리·다리·가시가 서로 다른 색이어야 실루엣이 읽힌다.
// 파트마다 머티리얼을 나누면 드로우콜이 유닛당 5~6개로 튄다. 대신 색을 메시의 정점에
// 구워 넣고(LowPoly.cs), 셰이더가 그 색을 알베도로 쓴다 — 유닛 하나 = 메시 하나 = 드로우콜 하나.
//
// Standard 셰이더는 정점 색을 무시한다. 그래서 이 셰이더가 있다.
// 노멀은 면마다 끊어서 굽기 때문에(플랫 셰이딩) 각 면의 명암이 확 갈린다 — 로우폴리의 생명.

Shader "GodTD/LowPolyLit"
{
    Properties
    {
        _Color ("전역 틴트", Color) = (1,1,1,1)
        _Glow ("자체 발광 (전체)", Range(0,3)) = 0
        // 3.0은 눈·코어를 순백으로 날려 색을 잃었다 (실측 255,255,255). 0.9에서 색이 남는다.
        _Emissive ("발광 마스크 세기 (정점 알파)", Range(0,6)) = 0.9
        _Smoothness ("매끈함", Range(0,1)) = 0.12
        _RimColor ("림 라이트 색", Color) = (0.5,0.7,1,1)
        _RimPower ("림 라이트 세기", Range(0,4)) = 1.1
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        LOD 200

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows vertex:vert
        #pragma target 3.0

        struct Input
        {
            float4 vcol;
            float3 viewDir;
        };

        fixed4 _Color;
        half _Glow;
        half _Smoothness;
        fixed4 _RimColor;
        half _RimPower;

        void vert(inout appdata_full v, out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input, o);
            o.vcol = v.color;
        }

        half _Emissive;

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            fixed3 c = IN.vcol.rgb * _Color.rgb;
            o.Albedo = c;
            o.Metallic = 0;
            o.Smoothness = _Smoothness;

            // 정점 색의 알파 = 발광 마스크. 머티리얼을 나누지 않고도 눈·코어만 빛나게 한다.
            // 부감 카메라에서 유닛을 알아보는 가장 강한 단서다 — 어두운 보드 위의 작은 밝은 점.
            half emit = _Glow + IN.vcol.a * _Emissive;

            // 림 라이트 — 어두운 배경에서 유닛 실루엣을 뜯어낸다.
            half rim = 1.0 - saturate(dot(normalize(IN.viewDir), o.Normal));
            o.Emission = c * emit + _RimColor.rgb * pow(rim, 3.0) * _RimPower;
        }
        ENDCG
    }

    FallBack "Diffuse"
}
