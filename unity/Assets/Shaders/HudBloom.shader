// 빌트인 RP용 미니 Bloom — 밝기 임계 추출 → 게시안 블러 → 가산 합성.
// URP 전환(아트 계획 P5) 시 Volume Bloom으로 대체되는 의도된 임시방편(P3).
Shader "Hidden/GodTD/Bloom"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
    }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always

        CGINCLUDE
        #include "UnityCG.cginc"

        sampler2D _MainTex;
        float4 _MainTex_TexelSize;
        sampler2D _BloomTex;
        float _Threshold;
        float _Intensity;

        struct v2f
        {
            float4 pos : SV_POSITION;
            float2 uv : TEXCOORD0;
        };

        v2f vert(appdata_img v)
        {
            v2f o;
            o.pos = UnityObjectToClipPos(v.vertex);
            o.uv = v.texcoord;
            return o;
        }
        ENDCG

        // 0: 밝기 임계 추출
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            fixed4 frag(v2f i) : SV_Target
            {
                fixed4 c = tex2D(_MainTex, i.uv);
                float brightness = max(c.r, max(c.g, c.b));
                float contribution = max(0, brightness - _Threshold) / max(brightness, 0.0001);
                return c * contribution;
            }
            ENDCG
        }

        // 1: 가로 블러
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            fixed4 frag(v2f i) : SV_Target
            {
                float2 d = float2(_MainTex_TexelSize.x, 0);
                fixed4 s = tex2D(_MainTex, i.uv) * 0.227;
                s += (tex2D(_MainTex, i.uv + d * 1.385) + tex2D(_MainTex, i.uv - d * 1.385)) * 0.316;
                s += (tex2D(_MainTex, i.uv + d * 3.230) + tex2D(_MainTex, i.uv - d * 3.230)) * 0.070;
                return s;
            }
            ENDCG
        }

        // 2: 세로 블러
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            fixed4 frag(v2f i) : SV_Target
            {
                float2 d = float2(0, _MainTex_TexelSize.y);
                fixed4 s = tex2D(_MainTex, i.uv) * 0.227;
                s += (tex2D(_MainTex, i.uv + d * 1.385) + tex2D(_MainTex, i.uv - d * 1.385)) * 0.316;
                s += (tex2D(_MainTex, i.uv + d * 3.230) + tex2D(_MainTex, i.uv - d * 3.230)) * 0.070;
                return s;
            }
            ENDCG
        }

        // 3: 가산 합성
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            fixed4 frag(v2f i) : SV_Target
            {
                fixed4 c = tex2D(_MainTex, i.uv);
                fixed4 b = tex2D(_BloomTex, i.uv);
                return c + b * _Intensity;
            }
            ENDCG
        }
    }
}
