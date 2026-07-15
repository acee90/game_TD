// 로우폴리 유닛용 셰이더 — 정점 색 × 조명. (URP 포팅판)
//
// 왜 필요한가: 유닛 하나는 몸통·머리·다리·가시가 서로 다른 색이어야 실루엣이 읽힌다.
// 파트마다 머티리얼을 나누면 드로우콜이 유닛당 5~6개로 튄다. 대신 색을 메시의 정점에
// 구워 넣고(LowPoly.cs), 셰이더가 그 색을 알베도로 쓴다 — 유닛 하나 = 메시 하나 = 드로우콜 하나.
//
// URP Lit는 정점 색을 무시한다. 그래서 이 셰이더가 있다.
// 노멀은 면마다 끊어서 굽기 때문에(플랫 셰이딩) 각 면의 명암이 확 갈린다 — 로우폴리의 생명.
//
// Built-in Surface Shader(surf ... Standard)를 UniversalFragmentPBR로 옮겼다 — metallic 0,
// 낮은 smoothness로 기존 Standard 룩을 유지한다. 정점 알파 = 발광 마스크, 림 라이트도 원본 그대로.

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
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }
        LOD 200

        // ───────── ForwardLit — 정점색 PBR + 발광 + 림 ─────────
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0

            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile _ _FORWARD_PLUS
            #pragma multi_compile _ _CLUSTERED_RENDERING
            #pragma multi_compile_fog
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _Color;
                float _Glow;
                float _Emissive;
                float _Smoothness;
                float4 _RimColor;
                float _RimPower;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                float4 color      : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float3 positionWS  : TEXCOORD0;
                float3 normalWS    : TEXCOORD1;
                float4 color       : COLOR;
                float  fogCoord    : TEXCOORD2;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            Varyings vert(Attributes IN)
            {
                Varyings OUT = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(IN);
                UNITY_TRANSFER_INSTANCE_ID(IN, OUT);

                VertexPositionInputs pos = GetVertexPositionInputs(IN.positionOS.xyz);
                VertexNormalInputs   nrm = GetVertexNormalInputs(IN.normalOS);

                OUT.positionHCS = pos.positionCS;
                OUT.positionWS  = pos.positionWS;
                OUT.normalWS    = nrm.normalWS;
                OUT.color       = IN.color;
                OUT.fogCoord    = ComputeFogFactor(pos.positionCS.z);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(IN);

                float3 albedo  = IN.color.rgb * _Color.rgb;
                float3 normalWS = normalize(IN.normalWS);
                float3 viewWS   = GetWorldSpaceNormalizeViewDir(IN.positionWS);

                // 정점 색 알파 = 발광 마스크 + 림 라이트 (원본 surf() 그대로)
                half rim = 1.0 - saturate(dot(viewWS, normalWS));
                float3 emission = albedo * (_Glow + IN.color.a * _Emissive)
                                + _RimColor.rgb * pow(rim, 3.0) * _RimPower;

                // Standard(metallic=0) 매칭 — URP PBR 경로로 메인/추가 광원·그림자·GI 처리
                SurfaceData sd = (SurfaceData)0;
                sd.albedo     = albedo;
                sd.metallic   = 0.0;
                sd.specular   = 0.0;
                sd.smoothness = _Smoothness;
                sd.emission   = emission;
                sd.occlusion  = 1.0;
                sd.alpha      = 1.0;

                InputData id = (InputData)0;
                id.positionWS      = IN.positionWS;
                id.normalWS        = normalWS;
                id.viewDirectionWS = viewWS;
                id.shadowCoord     = TransformWorldToShadowCoord(IN.positionWS);
                id.fogCoord        = IN.fogCoord;
                id.bakedGI         = SampleSH(normalWS);
                id.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(IN.positionHCS);
                id.shadowMask      = half4(1, 1, 1, 1);

                half4 color = UniversalFragmentPBR(id, sd);
                color.rgb = MixFog(color.rgb, IN.fogCoord);
                return color;
            }
            ENDHLSL
        }

        // ───────── ShadowCaster — 유닛이 그림자를 드리운다 ─────────
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On
            ZTest LEqual
            ColorMask 0
            Cull Back

            HLSLPROGRAM
            #pragma vertex shadowVert
            #pragma fragment shadowFrag
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            float3 _LightDirection;

            struct AttributesS { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct VaryingsS   { float4 positionCS : SV_POSITION; };

            VaryingsS shadowVert(AttributesS IN)
            {
                VaryingsS OUT;
                float3 positionWS = TransformObjectToWorld(IN.positionOS.xyz);
                float3 normalWS   = TransformObjectToWorldNormal(IN.normalOS);
                float4 positionCS = TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, _LightDirection));
                #if UNITY_REVERSED_Z
                    positionCS.z = min(positionCS.z, positionCS.w * UNITY_NEAR_CLIP_VALUE);
                #else
                    positionCS.z = max(positionCS.z, positionCS.w * UNITY_NEAR_CLIP_VALUE);
                #endif
                OUT.positionCS = positionCS;
                return OUT;
            }

            half4 shadowFrag(VaryingsS IN) : SV_Target { return 0; }
            ENDHLSL
        }

        // ───────── DepthOnly — 깊이 프리패스·SSAO용 ─────────
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On
            ColorMask 0
            Cull Back

            HLSLPROGRAM
            #pragma vertex depthVert
            #pragma fragment depthFrag
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct AttributesD { float4 positionOS : POSITION; };
            struct VaryingsD   { float4 positionCS : SV_POSITION; };

            VaryingsD depthVert(AttributesD IN)
            {
                VaryingsD OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                return OUT;
            }

            half4 depthFrag(VaryingsD IN) : SV_Target { return 0; }
            ENDHLSL
        }
    }

    FallBack "Universal Render Pipeline/Lit"
}
