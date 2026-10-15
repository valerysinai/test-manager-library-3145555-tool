# Plan previo · T-21 y RNF-1

Base main 0e2ee8a. Rama feature/tool-library. Este plan precede al código.
Referencias: README, docs constitution IX/XII, tasks T-21, decisiones C-04/C-06/C-07 y contrato API.
Fuentes de integración previstas: API 590a012, infra b496573 y React 47a517d, ya verificados en T-20.

## Interpretación y límites

El objetivo es demostrar aplicación de la especificación, no acumular registros. El sembrador
solo utiliza el contrato HTTP existente, con HTTPS confiable y credenciales desde entorno.
No hay SQL, conexión al motor, fechas enviadas en préstamos, cambios del plazo ni endpoints nuevos.
Se conservan entidades, nombres, producto y corte original de entrega.

Se elige Node.js con biblioteca estándar para la utilidad cliente/orquestación, coherente con
las herramientas de infra; el producto continúa en React y PHP/Laravel. No se crea otro backend.
Se separan cliente HTTPS, catálogo determinista, fases demo, medición y coordinación de despliegue.

## Demostración C-04, preparada antes de implementar

1. Exigir un destino aislado vacío por API (libros/socios/préstamos), cinco categorías y un estado
   local nuevo. Login admin; el iat del JWT comprueba el instante servido sin guardar el token.
2. Con demo/testing y 2026-09-29T14:15:00Z: crear 40 libros, 10 socios y tres préstamos de una línea
   para tres socios diferentes. Validar respuestas, cantidades y vencimiento a 14 días.
3. Infra recrea únicamente API en 2026-10-14T14:15:00Z, conservando base/volúmenes. Un token anterior
   retenido solo en memoria debe fallar; hacer login nuevo para continuar.
4. Crear otros doce préstamos entre los siete socios restantes, máximo tres líneas por socio.
5. Verificar por API exactamente 40 libros, 10 socios, 15 préstamos, tres líneas vencidas y reporte
   con 15 préstamos agregados. Guardar conteos, IDs sintéticos y resultados, nunca credenciales.

Las fases se ejecutan una vez. El checkpoint identifica el destino y el progreso; no promete
exactly-once ni reintenta escrituras con resultado incierto. Tras una ejecución parcial se conserva
el estado fallido y se prepara un entorno aislado nuevo, evitando duplicados y mezclas de datos.

## Medición C-07, separada de demo

- Otra base aislada, perfil normal y reloj real. Crear por API 5.000 libros deterministas,
  1.000 por categoría, con coincidencias conocidas en título y autor. Concurrencia acotada de carga.
- Cuatro búsquedas size=20: sin filtro, texto en título, texto en autor y categoría más texto.
- Por búsqueda, 20 llamadas de calentamiento excluidas y 100 medidas secuenciales. Medir envío
  hasta recepción completa con reloj monotónico; HTTPS persistente permitido, sin caché de respuestas.
- Conservar las 400 medidas, estados HTTP, errores, máximo, mediana/p95, consultas, revisiones,
  CPU/RAM y ubicación de cliente/servidor. No descartar fallos ni muestras lentas.
- RNF-1 pasa únicamente si las 400 respuestas son válidas y cada tiempo es menor de 300 ms.
  Un fallo conserva el informe y devuelve salida no exitosa; no se cambia el umbral.
- Registrar además diez clientes simultáneos como diagnóstico, sin añadir otro umbral de tiempo.

## Evidencia y comprobaciones previstas

Pruebas con cliente falso: campos de contrato, cardinalidad/distribución, fases, fallos parciales,
invariantes de conteos, ausencia de datos personales en reporte y estadísticos/frontera estricta.
Pruebas de cliente HTTPS: validación TLS, errores seguros y tiempos de recepción completa.
Prueba real: despliegues Compose efímeros con revisiones fijadas; datos creados únicamente por API,
cambio de reloj por despliegue, token antiguo rechazado, demo exacta y medición completa.
El orquestador limpia únicamente sus proyectos generados; no cambia un despliegue del usuario.

Commits pequeños y PR en inglés. Evidencia final distingue fakes, ejecución real y resultado de
RNF-1; una demostración de 40 libros no acredita rendimiento ni sustituye T-23/manual de feria.
