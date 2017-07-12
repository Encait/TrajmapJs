/**
 * STMAP2D supports the creation of 2D (Google) Maps for the representation of trajectories, and spatio-temporal information
 * 
 * Object representing a 2D Map with a WebGL Layer...
 * @param properties - key value array to change the default properties of the 2D Map
 */ 
function STMAP2D( properties )
{	
	this.version = "3.1";
	this.NON_PARTICLE_SIZE_REDUCTION_FACTOR = 1000;
	var mouseevent = null;
	var isOnContainer = false;
	var context = this;	
	var mouse = new THREE.Vector2(0,0);
	var projector = new THREE.Projector();
	var PERIOD = 250;

	var timeHandle;
	var bbox = {};
	var updateMapLayer = false;
	//var trajectoryPointsParticles = [];	
	//var mostRecentHighlightEvent;
	this.visiblePointRepresentations = [];
	
	this.container = properties.div;
	//this.container.position = "relative";
	this.map = new google.maps.Map( 
		this.container, 
		{
			zoom: ( !properties.hasOwnProperty("zoom") )? 3 : properties.zoom,
			mapTypeControl: ( !properties.hasOwnProperty("mapTypeControl") )? false : properties.mapTypeControl,
			center: ( !properties.hasOwnProperty("center") )? new google.maps.LatLng(37, -9) : properties.center,
			mapTypeId: ( !properties.hasOwnProperty("mapTypeId") )? google.maps.MapTypeId.ROADMAP : properties.mapTypeId,
			styles: ( !properties.hasOwnProperty("styles") )? STMAP2D.STYLES.DEFAULT_STYLE : styles,
			disableDoubleClickZoom: true
		}
	);
	
	this.maplayer = new ThreejsLayer(
		{ map: context.map }, 
		function(layer)
		{
			update(layer);
		}
	);
	
	/** **/
	this.onOptionMenuSelect = function( event ){};

	var heatmapLayer = null;

	if( !properties.hasOwnProperty("interacts") || properties.interacts  )
	{
		timeHandle = window.setInterval( function(e){animate();}, PERIOD);
		
		//google.maps.event.addListener( this.map, 'zoom_changed', function( event){  } );
		google.maps.event.addListener( this.map, 'mousemove', function( event ) { onMouseMove(event); }  );
		google.maps.event.addListener( this.map, 'click', function( event ) { onMouseClick(event); }  );
		//google.maps.event.addListener( this.map, 'mouseup',	function(e){} );		
		google.maps.event.addListener( this.map, 'mouseout', function(e){ isOnContainer = false; } );		
		google.maps.event.addListener( this.map, 'mousedown', // change to mousemove
			function(e)
			{
				mouseevent = null;
			}
		);
		google.maps.event.addListener( this.map, 'dblclick', function(event){ onMouseDoubleClick(event); });

		var optionsMenu = document.createElement( "div" );
		optionsMenu.setAttribute( "id", context.uuid+":stmapControls1" );
		optionsMenu.style.zIndex = 100;
		optionsMenu.style.position = "relative";
		optionsMenu.style.background = "#ffffff";
		optionsMenu.style.opacity = 1;
		//div.style.left = //(context.container.offsetLeft+5)+"px";
		//div.style.top = //(context.container.offsetTop+5)+"px";
		optionsMenu.innerHTML = 
			"<div style='padding:1px;float:right;border:1px solid black;text-align:right;background:white'>"+
				"<b>Shadows: </b>"+
				"<select id='"+context.uuid+"_select_shadows'>"+
					"<option value='none'>none</option>"+
					"<option value='dark'>dark</option>"+
					"<option value='heatmap'>heatmap</option>"+
				"</select>"+
				"<hr>"+
				"<b>Select space: </b>"+
				"<select id='"+context.uuid+"_select_space'>"+
					"<option value='point'>single point</option>"+
					"<option value='area'>area select</option>"+
				"</select>"+

			"</div>";
		optionsMenu.className += " map2DOptionsMenu";
		context.container.appendChild( optionsMenu );

		$("#"+context.uuid+"_select_shadows").change( function(){
			//console.log( "dshadowns", $(this).val() );
			drawMapShadows( context.visiblePointRepresentations );
			context.onOptionMenuSelect( { type:"shadow_menu", shadowOption: $(this).val(), 
				selectOption: $("#"+context.uuid+"_select_space").val() });
		});

		$("#"+context.uuid+"_select_space").change( function(){
			//context.onOptionMenuSelect( {type:"" } );
			context.onOptionMenuSelect( { type:"select_space_menu", 
				shadowOption: $("#"+context.uuid+"_select_shadows").val(), 
				selectOption: $(this).val() });
		});
	}	
	
	this.stPointsLayers = [];
	this.stPeriodLayers = [];
	this.highlightLayers = [];
	var mostRecentHighlightEvent;
	
	// highlight status?
	
	//this.trajectoryLayers = [];
	//this.stpointsetLayers = [];
	//var fixedHighlights = [];
	//var temporaryHighlights = [];	
	
	
	/** ********************************************************************************************************************** **/

	/** @return object with the bounding box containing all the points in the map */ 
	this.boundingBox = function() // to optimize
	{
		return computeBoundingBox();		
	};
	
	/* Calculates the bounding box containing all points in the map
	 * @return object with the bounding box containing all the points in the map
	 */ 
	var computeBoundingBox = function()
	{		
		var bb = { up: -90, down: 90, left: 180, right: -180 };
		for( var i = 0, stpoil = context.stPointsLayers.length, stperl = context.stPointsLayers.length;
				i < stpoil || i < stperl; i++ )
		{			
			if( i < stpoil)
			{
				bb = context.stPointsLayers[i].data.boundingBox();
				bbox.up = (bb.up > bbox.up)? bb.up : bbox.up;
				bbox.down = (bb.down < bbox.down)? bb.down : bbox.down;
				bbox.left = (bb.left < bbox.left)? bb.left : bbox.left;
				bbox.right = (bb.right > bbox.right)? bb.right : bbox.right;
				
				var tper = context.stPointsLayers[i].data.timePeriod();
				bbox.start = ( !bbox.hasOwnProperty("start") || bbox.start < tper.start )? tper.start : bbox.start;
				bbox.end = ( !bbox.hasOwnProperty("end") || bbox.end < tper.end )? tper.end : bbox.end;					
			}
			
			if( i < stperl )
			{				
				bb = context.stPointsLayers[i].data.boundingBox();
				bbox.up = (bb.up > bbox.up)? bb.up : bbox.up;
				bbox.down = (bb.down < bbox.down)? bb.down : bbox.down;
				bbox.left = (bb.left < bbox.left)? bb.left : bbox.left;
				bbox.right = (bb.right > bbox.right)? bb.right : bbox.right;
				
				var tper = context.stPointsLayers[i].data.timePeriod();
				bbox.start = ( !bbox.hasOwnProperty("start") || bbox.start < tper.start )? tper.start : bbox.start;
				bbox.end = ( !bbox.hasOwnProperty("end") || bbox.end < tper.end )? tper.end : bbox.end;
			}			
		}	
		//computeTrajectoryLayersBoundingBox();
		//computeSTPointSetLayersBoundingBox( true );
		return bbox;
	};
	
	var selectObjectIndex = function( intersects, mousePoint )
	{
		//mousePoint.z = -50;
		var zoomLevel = context.maplayer.map.getZoom();
		var DISTANCE_TO_RAY_THRESHOLD = 0.1/zoomLevel;
		var currentClosest = -1;
		//var closestCandidate = -1;
		var index = 0;
		
		while( index < intersects.length )
		{			
			if( currentClosest === -1 )
			{
				var currentIsVertex = intersects[index].hasOwnProperty("distanceToRay");
				currentClosest = ( (currentIsVertex && intersects[index].distanceToRay < DISTANCE_TO_RAY_THRESHOLD) || !currentIsVertex )? index : -1;
			}
			else
			{
				var candidateIsVertex = intersects[index].hasOwnProperty("distanceToRay");
				if( (candidateIsVertex && intersects[index].distanceToRay < DISTANCE_TO_RAY_THRESHOLD) || !candidateIsVertex )
				{
					var currentIsVertex = intersects[currentClosest].hasOwnProperty("distanceToRay");
					
					var currentIsLine = intersects[currentClosest].object instanceof THREE.Line;
					var candidateIsLine = intersects[index].object instanceof THREE.Line;
					
					if( currentIsVertex && candidateIsVertex )
					{
						var distanceCurrent = intersects[currentClosest].distanceToRay;
						var distanceCandidate = intersects[index].distanceToRay;
						if( currentIsLine !== candidateIsLine )
							currentClosest = (!candidateIsLine)? index : currentClosest;
						else
							currentClosest = (distanceCandidate < distanceCurrent)? index : currentClosest;		
					}
					else if( currentIsLine && candidateIsLine ) // ?
					{
						var distanceCurrent = intersects[currentClosest].distance;
						var distanceCandidate = intersects[index].distance;
						if( distanceCurrent === distanceCandidate )
						{
							distanceCurrent = UTILS.pointDistance( mousePoint, intersects[currentClosest].point );
							distanceCandidate = UTILS.pointDistance( mousePoint, intersects[index].point );

							if( distanceCurrent < DISTANCE_TO_RAY_THRESHOLD/5 || distanceCandidate < DISTANCE_TO_RAY_THRESHOLD/5 )
								currentClosest = ( distanceCandidate < distanceCurrent )? index : currentClosest;
						}
					}
					else // ?
					{						
						var distanceCurrent = intersects[currentClosest].distance;
						var distanceCandidate = intersects[index].distance;
						if( distanceCurrent === distanceCandidate && currentIsLine !== candidateIsLine )
						{
							var ind1, ind2;
							if( intersects[currentClosest].hasOwnProperty("index") )
								ind1 = intersects[currentClosest].index;
							else if( intersects[currentClosest].hasOwnProperty("vertex") )
								ind1 = intersects[currentClosest].vertex;
							else
								ind1 = intersects[currentClosest].object.dpi;
							
							if( intersects[index].hasOwnProperty("index") )
								ind2 = intersects[index].index;
							else if( intersects[index].hasOwnProperty("vertex") )
								ind2 = intersects[index].vertex;
							else
								ind2 = intersects[index].object.dpi;
							
							currentClosest = ( ind2 < ind1 )? index : currentClosest;					
						}
						else
						{
							currentClosest = ( distanceCandidate < distanceCurrent )? index : currentClosest;
						}
					}
				}
			}			
			index++;			
		}		
		//console.log( "si~~~~>", zoomLevel, DISTANCE_TO_RAY_THRESHOLD, intersects, currentClosest, intersects[currentClosest], JSON.stringify(mousePoint) );		
		//currentClosest = 0;
		
		return currentClosest;
	};
	
	var currentSpatialHighlight = null;
	var areaSelecting = false;

	var raycaster = new THREE.Raycaster();
	var DISTANCE_TO_RAY_THRESHOLD = 0.075;
	/* Processes the detection of mouse intersections with the displayed data */
	var animate = function()
	{
		if( mouseevent === null || !isOnContainer ) return;
		
		var mapSize = STMAP2D.UTILS.getDivSize( context.container );
		mouse.x = (mouseevent.pixel.x / mapSize.w) * 2 -1;
		mouse.y = -(mouseevent.pixel.y / mapSize.h) * 2 + 1;
		
		var vector = new THREE.Vector3( mouse.x, mouse.y, -1 );		
		vector.unproject( context.maplayer.camera );
		var direction = new THREE.Vector3( 0, 0, -1 ).transformDirection( context.maplayer.camera.matrixWorld );

		raycaster.set( vector, direction );
		var intersects = raycaster.intersectObjects( context.maplayer.scene.children );		
		//var intersects = ray.intersectObjects( context.maplayer.scene.children, false, 0.1 );
		//console.log( "vector = ", vector );
		//console.log( "vc", JSON.stringify(vector) );
		var i = (intersects.length > 0 )? selectObjectIndex( intersects, JSON.parse( JSON.stringify(vector) ) ) : -1;
		
		var dbclicked = doubleClick;
		if( doubleClick ) doubleClick = false;

		if( areaSelecting )
		{
			var newPath = new Array();
			var path = currentSpatialHighlight.getPath();
			var startPoint = path.getAt(0);
			newPath.push( 
				startPoint,
				new google.maps.LatLng( mouseevent.latLng.lat(), startPoint.lng() ),
				mouseevent.latLng,
				new google.maps.LatLng( startPoint.lat(), mouseevent.latLng.lng() ),
				startPoint
			);
			currentSpatialHighlight.setPath( newPath );
		}

		if ( i !== -1  ) 
		{			
			var object = intersects[i].object;								
			if( object.display )
			{
				var dataClick = false;
				if( object.objtype === STMAP2D.UTILS.OBJECT_TYPES.PARTICLE_POINT )
				{
					var eventParams = computeParticleIntersection(intersects[i].object, intersects[i].index );
					if( eventParams !== null )
					{
						context.onFeatureHover( eventParams );
						mostRecentHighlightEvent = eventParams;
					}
					dataClick = true;										
				}
				else if( object.objtype === STMAP2D.UTILS.OBJECT_TYPES.CUBE_POINT ||
					 	 object.objtype === STMAP2D.UTILS.OBJECT_TYPES.SPHERE_POINT ||
					 	 object.objtype === STMAP2D.UTILS.OBJECT_TYPES.PLANE_POINT )
				{					
					var eventParams = computeMeshIntersection( intersects[i].object );
					if( eventParams !== null )
					{						
						context.onFeatureHover( eventParams );
						mostRecentHighlightEvent = eventParams;	
					}
					dataClick = true;					
				}
				else if( object.objtype === STMAP2D.UTILS.OBJECT_TYPES.LINE )
				{
					var eventParams = computeLineIntersection( intersects[i].object, intersects[i].point, intersects[i] );
					if( eventParams !== null )
					{
						context.onFeatureHover( eventParams );
						mostRecentHighlightEvent = eventParams;
					}
					dataClick = true;					
				}
				else if( object.objtype === STMAP2D.UTILS.OBJECT_TYPES.POLYLINE )
				{
					var eventParams = computePolyLineIntersection( intersects[i].object, intersects );
					if( eventParams !== null )
					{
						context.onFeatureHover( eventParams );
						mostRecentHighlightEvent = eventParams;
					}
					dataClick = true;					
				}

				//console.log( "~~~!!!!~~~", dataClick, dbclicked );
				if( dataClick && dbclicked )
				{
					context.onFeatureDblClick( mostRecentHighlightEvent );
					doubleClick = dbclicked = false;
				}						
			}
		}
		else
		{
			context.onFeatureHoverStop();
			removeTemporaryHighlights();

			if( dbclicked )
			{
				var selectionType = $("#"+context.uuid+"_select_space").val();
				if( currentSpatialHighlight === null )
				{
					if( selectionType == "point" )
					{
						areaSelecting = false;
						var hmarker = new google.maps.Marker({
							map: context.map,
							position: mouseevent.latLng
						});
						currentSpatialHighlight = hmarker;

						var cevent = {
							type: "point",
							marker: hmarker,
							position: mouseevent.latLng
						};
						context.onSpatialPointSelect( cevent );

					}
					else if( selectionType == "area" )
					{
						var pos = [ mouseevent.latLng, mouseevent.latLng, mouseevent.latLng, mouseevent.latLng ];
						var polyg = new google.maps.Polyline({
							path: pos,
							strokeColor: '#FF0000',
							strokeOpacity: 0.8,
							strokeWeight: 2
						});

						polyg.setMap( context.map );
						currentSpatialHighlight = polyg;
						areaSelecting = true;

						google.maps.event.addListener( polyg, 'dblclick', function(){
							if( areaSelecting )
							{
								areaSelecting = false;
								var cevent = {
									type: "area",
									marker: currentSpatialHighlight,
									position_start: currentSpatialHighlight.getPath().getAt(0),
									position_end: mouseevent.latLng
								};
								context.onSpatialAreaSelect( cevent );
							}
						});
					}
				}
				else
				{
					if( currentSpatialHighlight instanceof google.maps.Marker )
						context.onSpatialPointSelect( {type:"point"} );
					else if( currentSpatialHighlight instanceof google.maps.Polyline )
						context.onSpatialAreaSelect( {type:"area"} );
					if( currentSpatialHighlight !== null )
					{
						currentSpatialHighlight.setMap( null );
						currentSpatialHighlight = null;	
					}
					if( areaSelecting )
					{
						areaSelecting = false;
						var cevent = {
							type: "area",
							marker: currentSpatialHighlight,
							position_start: currentSpatialHighlight.getPath().getAt(0),
							position_end: mouseevent.latLng
						};
						context.onSpatialAreaSelect( cevent );
					}
				}
			}
		}
	};

	/**
	 *
	 */
	this.removeSpatialHighlight = function()
	{	
		if( currentSpatialHighlight !== null )
		{
			currentSpatialHighlight.setMap( null );
			currentSpatialHighlight = null;
			if( areaSelecting )
			{
				areaSelecting = false;
				var cevent = {
					type: "area",
					marker: currentSpatialHighlight,
					position_start: currentSpatialHighlight.getPath().getAt(0),
					position_end: mouseevent.latLng
				};
				this.onSpatialAreaSelect( cevent );
			}
		}
	};

	/**
	 *
	 */
	this.highlightSpatialPoint = function( stPoint )
	{
		if( currentSpatialHighlight !== null )
			this.removeSpatialHighlight();	
		
		var hmarker = new google.maps.Marker({
			map: this.map,
			position: stPoint
		});
		currentSpatialHighlight = hmarker;	
		return currentSpatialHighlight;	
	};

	/**
	 *
	 */
	this.highlightSpatialArea = function( startPoint, endPoint )
	{
		if( currentSpatialHighlight !== null )
			removeSpatialHighlight();

		var pos = [ 
			startPoint,
			new google.maps.LatLng( endPoint.lat(), startPoint.lng() ),
			endPoint,
			new google.maps.LatLng( startPoint.lat(), endPoint.lng() ),
			startPoint
		];

		var polyg = new google.maps.Polyline({
			path: pos,
			strokeColor: '#FF0000',
			strokeOpacity: 0.8,
			strokeWeight: 2
		});

		polyg.setMap( this.map );
		currentSpatialHighlight = polyg;

		return currentSpatialHighlight;
	};

	this.onSpatialPointSelect = function( event )
	{
	};

	this.onSpatialAreaSelect = function( event )
	{
	};
	
	var tempTimeHighlight = null;
	var currentHighlightedLayer = null;
	
	/*
	 * 
	 */
	var removeTemporaryHighlights = function()
	{
		if( currentHighlightedLayer !== null )
		{
			currentHighlightedLayer.removeHighlight();
			currentHighlightedLayer = null;
		}
		if( tempTimeHighlight !== null )
		{
			//cube.removeHighlight( tempTimeHighlight );
			tempTimeHighlight = null;
		}
		mostRecentHighlightEvent = undefined;
		context.maplayer.render();
	};
	
	// COMPUTE INTERSECTIONS-START ################################	
	/*
	 * 
	 */
	var computeParticleIntersection = function( selectedObject, vertex)
	{
		var layer = layerByName( selectedObject.layer ); 
		if( layer === null ) return null;
		var data = layer.data;
		var particleVertex = vertex;
		var dataPointIndex = selectedObject.fdpi + particleVertex;
		var dataPoint = data.points[ dataPointIndex ];
		var pointStyle = layer.stylePoints( data, dataPoint, dataPointIndex ); 
								
		var eventParams = {};
		eventParams.layer = layer;
		eventParams.type = selectedObject.objtype;
		eventParams.data = data;
		eventParams.datapointindex = dataPointIndex;
		eventParams.datapoint = dataPoint;
		eventParams.pointStyle = pointStyle;
		
		// HIGHLIGHT HERE
		removeTemporaryHighlights();
		layer.highlightFeature( selectedObject, dataPointIndex, particleVertex );		
		currentHighlightedLayer = layer;
		
		//var time = dataPoint.timestamp;										
		//var highlightuuid = cube.highlightTimeMoment( dataPoint, new STCJS.LineStyle( { alpha: pointStyle.alpha, colour: pointStyle.colour, dashed: false } ), context.highlightMapPlane );		
		//tempTimeHighlight = highlightuuid;		
		return eventParams;
	};
	
	/*
	 * 
	 */
	var computeMeshIntersection = function( selectedObject )
	{		
		var layer = layerByName( selectedObject.layer );
		if( layer === null ) return null;
		var data = layer.data;
		var dataPointIndex = selectedObject.dpi;
		var dataPoint = data.points[ dataPointIndex ];
		var pointStyle = layer.stylePoints( data, dataPoint, dataPointIndex ); 
		
		var eventParams = {
			layer: layer,
			type: selectedObject.objtype,
			data: data,
			datapointindex: dataPointIndex,
			datapoint: dataPoint,
			pointStyle: pointStyle	
		};
				
		removeTemporaryHighlights();		
		layer.highlightFeature( selectedObject, dataPointIndex );
		currentHighlightedLayer = layer;
		//var time = dataPoint.timestamp;										
		//var highlightuuid = cube.highlightTimeMoment( dataPoint, new STCJS.LineStyle( { alpha: pointStyle.alpha, colour: pointStyle.colour, dashed: false } ), context.highlightMapPlane );
		//tempTimeHighlight = highlightuuid;
			
		return eventParams;
	};
	
	/*
	 * 
	 */
	var computeLineIntersection = function( selectedObject, point, intersected )
	{
		var layer = layerByName( selectedObject.layer );
		if( layer === null ) return null;
		var data = layer.data;
		var startLineVertex = selectedObject.geometry.vertices[intersected.vertex].dpi;// intersected.startvertex;
		var endLineVertex = selectedObject.geometry.vertices[intersected.vertex+1].dpi;
		var startDataPoint = data.points[ startLineVertex ];
		var endDataPoint = data.points[ endLineVertex ];
		//var startLineStyle, endLineStyle;
		var lineStyle = layer.styleLines( data, startDataPoint, startLineVertex, endLineVertex );
		
		//lineStyleStart = layer.styleLines( data, startDataPoint, startLineVertex, endLineVertex );
		//lineStyleEnd = layer.styleLines( data, endDataPoint, endLineVertex, startLineVertex );
									
		//trigger event				
		var eventParams = {
			type: selectedObject.objtype,
			layer: layer,
			data: data,
			startpointindex: startLineVertex,
			endpointindex: endLineVertex,
			startdatapoint: startDataPoint,
			enddatapoint: endDataPoint,
			lineStyle: lineStyle,
			//startstyle: lineStyleStart,
			//endstyle: lineStyleEnd,
			midpoint: new STPoint( mouseevent.latLng.lat(), mouseevent.latLng.lng() )			
		};
		removeTemporaryHighlights();
		//layer.highlightFeature( selectedObject, startLineVertex, startLineVertex, endLineVertex );
		layer.highlightFeature( selectedObject, startLineVertex, intersected.vertex, intersected.vertex+1 );
		currentHighlightedLayer = layer;
		//var highlightuuid = cube.highlightTimePeriod( startDataPoint, endDataPoint, lineStyleStart, lineStyleEnd, context.highlightMapPlane );
		//tempTimeHighlight = highlightuuid;	
		//console.log( eventParams );	
		return eventParams;
	};
	
	/*
	 * 
	 */
	var computePolyLineIntersection = function( selectedObject, intersected )
	{
		var layer = layerByName( selectedObject.layer );
		if( layer === null ) return null;
		var data = layer.data;
		var startLineVertex = selectedObject.sdpi;
		var endLineVertex = selectedObject.edpi;
		var startDataPoint = data.points[ startLineVertex ];
		var endDataPoint = data.points[ endLineVertex ];
		//var startLineStyle, endLineStyle;
		
		//lineStyleStart = layer.styleLines( data, startDataPoint, startLineVertex, endLineVertex );
		//lineStyleEnd = layer.styleLines( data, endDataPoint, endLineVertex, startLineVertex );
		var polyLineStyle = layer.styleLines( data, startDataPoint, startLineVertex, endLineVertex );
							
		/*var a = context.stpoint2stc( startDataPoint );
		var b = context.stpoint2stc( endDataPoint );
		var c = intersected.point;
		var estimatedMidPoint = STCJS.UTILS.getClosestPointTo3DLine( context, a, b, c );*/
			
		//trigger event				
		var eventParams = {
			type: selectedObject.objtype,
			layer: layer,
			data: data,
			startpointindex: startLineVertex,
			endpointindex: endLineVertex,
			startdatapoint: startDataPoint,
			enddatapoint: endDataPoint,
			lineStyle: polyLineStyle,
			//startstyle: lineStyleStart,
			//endstyle: lineStyleEnd,		
			//colpoint: context.stc2stpoint( c ), //<----
			//midpoint: context.stc2stpoint( estimatedMidPoint ) //<---
			midpoint: new STPoint( mouseevent.latLng.lat(), mouseevent.latLng.lng() )
		};		
		
		removeTemporaryHighlights();
		layer.highlightFeature( selectedObject, startLineVertex, startLineVertex, endLineVertex );
		currentHighlightedLayer = layer;		
		//var highlightuuid = cube.highlightTimePeriod( startDataPoint, endDataPoint, lineStyleStart, lineStyleEnd, context.highlightMapPlane ); 
		//tempTimeHighlight = highlightuuid;		
		return eventParams;
	};
	
	// COMPUTE INTERSECTIONS-END ###################################
	
	/**
	 *
	 */
	this.highlightDataPoint = function( point, properties )
	{
		var hlayer;
		if( data instanceof STPoint )
		{
			var data = new STPointSet("temp highlight");
			data.appendPoints( [point] );
			data.boundingBox();

			var props = {};
			if( properties.hasOwnProperty("stylePoints") )
				props.stylePoints = properties.stylePoints;
			if( properties.hasOwnProperty("styleLines") )
				props.styleLines = properties.styleLines;
			
			props.zIndex = 1;
			hlayer = new STMAP2D.SpatioTemporalLayer( "hDataLayer", data, props );
			hlayer.setSTMap( this );
			hlayer.uuid = hlayer.data.uuid;
			// 2d map does not need/support additional items for higlighting
			
			hlayer.drawLayer();
			this.highlightLayers.push( hlayer );
			updateMapLayer = true;
		}
		else
		{
			hlayer = {uuid: null};
		}
		return hlayer.uuid;	
	};

	/**
	 * 
	 */
	this.highlightData = function( data, properties )
	{
		var hlayer;
		if( data instanceof Trajectory || data instanceof STPointSet )
		{
			var props = {};
			if( properties.hasOwnProperty("stylePoints") )
				props.stylePoints = properties.stylePoints;
			if( properties.hasOwnProperty("styleLines") )
				props.styleLines = properties.styleLines;
			
			props.zIndex = 1;
			hlayer = new STMAP2D.SpatioTemporalLayer( "hDataLayer", data, props );
			hlayer.setSTMap( this );
			hlayer.uuid = hlayer.data.uuid;
			// 2d map does not need/support additional items for higlighting
			
			hlayer.drawLayer();
			this.highlightLayers.push( hlayer );
			updateMapLayer = true;
			this.maplayer.render();
		}
		else
		{
			hlayer = {uuid: null};
		}
		return hlayer.uuid;		
	};
	
	/**
	 * 
	 */
	this.removeDataHighlight = function( huuid )
	{
		var found = false;
		var i = 0;
		for( i = 0; i < this.highlightLayers.length && !found; i++ )
		{
			found = (this.highlightLayers[i].uuid === huuid );
			if( found ) i--; // yeah yeah yeah, I know I know
		}
		if( found )
		{
			var l2r = this.highlightLayers.splice( i, 1 )[0];
			l2r.removeLayer();
		}

		this.maplayer.render();
	};
	
	/*
	 * Obtains a layer given a name
	 * @param layerName - name of the layer to be found
	 * @returns - the Layer with the corresponding name, or null if not found 
	 */
	var layerByName = function( layerName )
	{
		var hasFound = false;
		var i = 0;
		var layer = null;
		
		while( !hasFound && i < context.stPointsLayers.length )
		{
			hasFound = context.stPointsLayers[i].name === layerName;
			i++;
		}
		i--;
		if( hasFound )
			layer = context.stPointsLayers[i];
		else
		{
			i = 0;
			while( !hasFound && i < context.stPeriodLayers.length )
			{
				hasFound = context.stPeriodLayers[i].name === layerName;
				i++;
			}
			i--;
			
			if( hasFound )
				layer = context.stPeriodLayers[i];
			/*else
			{
				i = 0;
				while( !hasFound && i < context.highlightLayers.length )
				{
					hasFound = context.highlightLayers[i].name === layerName;
					i++;
				}
				i--;
				
				if( hasFound )
					layer = context.highlightLayers[i];
			}*/
		}
		// search on highlightLayer -- HERE
				
		return layer;
	};
			
	/**
	 * Creates a pop up window in the map
	 * @param contentString <String> contents of the window
	 * @param latlngPoint <google.maps.LatLng> location of the window
	 * @return <google.maps.InfoWindow> created
	 */
	this.addPopUpWindow = function( contentString, latlngPoint )
	{
		var infowindow = new google.maps.InfoWindow(
			{
				content: contentString,
				position: latlngPoint
			}
		);
		
		google.maps.event.addListener(infowindow,'closeclick',
		function(){
			//context.removeHighlight(-1, true);			
			//removeHighlights();
			//context.onFullHighlightRemoval();
		});
		
		infowindow.open( this.map );		
		this.map.panTo( latlngPoint );
		
		return infowindow;
	};
		
	/**
	 * Adds a set of layers to the map
	 * @param layer <Array:<STMAP2D.Layer>> layers to be added
	 * @param refresh <Bool> true|flase if the the map is automaticaly updated after adding the layer or not 
	 */ 
	this.addLayers = function( layers, refresh )
	{
		refresh = typeof refresh !== 'undefined' ? refresh : true;
				
		if( this.stPointsLayers.length === 0 && this.stPeriodLayers.length == 0 )  
			//this.trajectoryLayers.length === 0 && this.stpointsetLayers.length === 0 && 
			//this.stperiodsetLayers.length == 0 )
		{
			bbox.start = layers[0].data.timePeriod().start;
			bbox.end = layers[0].data.timePeriod().end;
		}
		
		bbox.up = -90;
		bbox.down = 90;
		bbox.left = 180;
		bbox.right = -180;		
		
		for( var i = 0; i < layers.length; i++ )
		{
			var layer = layers[i];
			layer.setSTMap( this );
			
			if( layer instanceof STMAP2D.SpatioTemporalLayer )
				this.stPointsLayers.push( layer );
			else if( layer instanceof STMAP2D.STPeriodSetLayer )
				this.stPeriodLayers.push( layer );
			
			var bb = layers[i].data.boundingBox();
			bbox.up = (bb.up > bbox.up)? bb.up : bbox.up;
			bbox.down = (bb.down < bbox.down)? bb.down : bbox.down;
			bbox.left = (bb.left < bbox.left)? bb.left : bbox.left;
			bbox.right = (bb.right > bbox.right)? bb.right : bbox.right;
			
			bbox.start = (bbox.start < layers[i].data.timePeriod().start)? bbox.start : layers[i].data.timePeriod().start;
			bbox.end = (bbox.end > layers[i].data.timePeriod().end)? bbox.end : layers[i].data.timePeriod().end;
			
		}
		if( refresh )
		{
			updateMapLayer = true;
			update( this.maplayer );
		}
	};
	
	/**
	 * TODO - TEST 
	 */
	this.removeLayers = function( layers, refresh )
	{
		refresh = typeof refresh !== 'undefined' ? refresh : true;

		var onefound = false;
		var needsSpatialUpdate = needsTemporalUpdate = false;
		for( var li = 0, ll = layers.length; li < ll; li ++ )
		{
			var found = false;
			var layer = layers[li];
			
			// remove layer contents from view
			layer.removeLayer();
			//layer.stmap = null;
			
			var index = 0;
			for( index = 0, l = this.stPointsLayers.length; index < l && !found; index++ )
			{
				found = layer.name === this.stPointsLayers[index].name;
			}
			if( found ) this.stPointsLayers = this.stPointsLayers.splice( index, 1 );

			for( index = 0, l = this.stPeriodLayers.length; index < l && !found; index++ )
			{
				found = layer.name === this.stPeriodLayers[index].name;
			}
			if( found ) this.stPeriodLayers = this.stPeriodLayers.splice( index, 1 );
			
			
			
			var bb = layer.data.boundingBox();
			needsSpatialUpdate = needsSpatialUpdate && ( (bbox.up === bb.up || bbox.down === bb.down || bbox.left === bb.left || bbox.right === bb.right) );
			needsTemporalUpdate = needsTemporalUpdate && ( (bbox.start === bb.start && refresh) || (bbox.end === bb.end && refresh) );
			onefound = onefound || found;
		}
		
		var needsUpdate = needsSpatialUpdate || needsTemporalUpdate;
		
		if( needsUpdate )
		{
			if( needsSpatialUpdate )
			{
				bbox.up = -90;
				bbox.down = 90;
				bbox.left = 180;
				bbox.right = -180;
			}
			else
			{				
				bbox.start = (new Date()).getTime();
				bbox.end = -1;
			}
			
			for( var i = 0, 
				l1 = this.stPointsLayers.length, 
				l2 = this.stPeriodLayers.length; i < l1 || i < l2; i++ )
			{
				var bb;
				var tp;
				if( i < l1 )
				{
					bb = this.stPointsLayers[i].data.boundingBox();
					tp = this.stPointsLayers[i].data.timePeriod();

					if( needsSpatialUpdate )
					{
						bbox.up = (bb.up > bbox.up)? bb.up : bbox.up;
						bbox.down = (bb.down < bbox.down)? bb.down : bbox.down;
						bbox.left = (bb.left < bbox.left)? bb.left : bbox.left;
						bbox.right = (bb.right > bbox.right)? bb.right : bbox.right;
					}
					if( needsTemporalUpdate )
					{					
						bbox.start = (bbox.start < tp.start)? bbox.start : tp.start;
						bbox.end = (bbox.end > tp.end)? bbox.end : tp.end;
					}
				}
				if( i < l2  )
				{
					bb = this.stPeriodLayers[i].data.boundingBox();
					tp = this.stPeriodLayers[i].data.timePeriod();					

					if( needsSpatialUpdate )
					{
						bbox.up = (bb.up > bbox.up)? bb.up : bbox.up;
						bbox.down = (bb.down < bbox.down)? bb.down : bbox.down;
						bbox.left = (bb.left < bbox.left)? bb.left : bbox.left;
						bbox.right = (bb.right > bbox.right)? bb.right : bbox.right;
					}
					if( needsTemporalUpdate )
					{					
						bbox.start = (bbox.start < tp.start)? bbox.start : tp.start;
						bbox.end = (bbox.end > tp.end)? bbox.end : tp.end;
					}
				}
			}
		}

		if( onefound && refresh )
		{
			this.refresh();
		}
		
		return onefound;
	};
	
	this.clearMap2D = function()
	{
		removeTemporaryHighlights();
		for( var i = 0, l1 = this.stPointsLayers.length,
			l2 = this.stPeriodLayers.length,
			l3 = this.highlightLayers.length; i < l1 || i < l2 || i < l3; i++ )
		{
			if( i < l1 )
			{
				this.stPointsLayers[i].removeLayer();
				this.stPointsLayers[i].stcMap = null;
			}
			if( i < l2 )
			{
				this.stPeriodLayers[i].removeLayer();
				this.stPeriodLayers[i].stcMap = null;
			}
			if( i < l3 )
			{
				this.highlightLayers[i].removeLayer();
				this.highlightLayers[i].stcMap = null;
			}
		}

		this.stPointsLayers = [];
		this.stPeriodLayers = [];
		this.highlightLayers = [];

		this.refresh();
	};
	
	/**
	 * Redraws the map's contents
	 */ 
	this.refresh = function()
	{
		//updateMapLayer = true;
		this.maplayer.render();
		if( $("#"+context.uuid+"_select_shadows").val() != "none" )
		{
			computeDataPointVisbility();
			drawMapShadows( this.visiblePointRepresentations );
		}
	};

	var computeDataPointVisbility = function()
	{
		context.visiblePointRepresentations = [];
		
		for( var i = 0; i < context.stPointsLayers.length || i < context.stPeriodLayers.length; i++ )
		{
			if( i < context.stPointsLayers.length && context.stPointsLayers[i].visible )
			{
				context.visiblePointRepresentations = 
					context.visiblePointRepresentations.concat( context.stPointsLayers[i].getRepresentationVisiblePoints() );
			}		
		}		
	};

	var drawMapShadows = function( dataPoints ) 
	{
		var shadowValue = $("#"+context.uuid+"_select_shadows").val();

		var getPointsArray = function( points )
		{
			var gps = [];
			for( var i = 0; i < points.length; i++ )
				gps.push( new google.maps.LatLng(points[i].latitude, points[i].longitude) );

			return gps;
		};

		var gpoints = new google.maps.MVCArray( (shadowValue == "none")? [] : getPointsArray( dataPoints ) );

		if( heatmapLayer === null )
		{
			heatmapLayer = new google.maps.visualization.HeatmapLayer({
				data: gpoints
			});

			heatmapLayer.setMap( context.map );
		}
		else
			heatmapLayer.set( 'data', gpoints );

		var gradient = null;
		var radius = 0;
		if( shadowValue == "dark" )
		{
			gradient = [
				'rgba(255, 255, 255, 0)',
				'rgba(250, 250, 250, 1)',
				//'rgba(150, 150, 150, 1)',
				'rgba(100, 100, 100, 1)',
				//'rgba(50, 50, 50, 1)',
				'rgba(0, 0, 0, 1)'
			];
			radius = 15;
		}
		else if( shadowValue == "heatmap" )
		{
			gradient = [
				'rgba(255, 255, 255, 0)',
				'rgba(0, 0, 255, 1)',
				'rgba(0, 255, 255, 1)',
				'rgba(0, 255, 0, 1)',
				'rgba(0, 255, 255, 1)',
				'rgba(255, 0, 0, 1)',
			];
			radius = 10;
		}
		heatmapLayer.set('gradient', gradient);
		heatmapLayer.set('radius', radius);
	};
	
	/*
	 * Redraws the map layer's contents
	 * @param layer <ThreejsLayer>
	 */ 
	var update = function( layer )
	{
		if( !updateMapLayer ) return;

		context.visiblePointRepresentations = [];
		
		for( var i = 0; i < context.stPointsLayers.length || i < context.stPeriodLayers.length; i++ )
			//|| i < context.trajectoryLayers.length || i < context.stpointsetLayers.length || i < context.stperiodsetLayers.length; i++ )
		{
			if( i < context.stPointsLayers.length && context.stPointsLayers[i].visible )
			{
				context.stPointsLayers[i].removeLayer();
				context.stPointsLayers[i].drawLayer();

				context.visiblePointRepresentations = 
					context.visiblePointRepresentations.concat( context.stPointsLayers[i].getRepresentationVisiblePoints() );
			}
			if( i < context.stPeriodLayers.length && context.stPeriodLayers[i].visible )
			{
				context.stPeriodLayers[i].removeLayer();
				context.stPeriodLayers[i].drawLayer();				
			}			
		}		
		
		layer.render();
		updateMapLayer = false;	
		drawMapShadows( context.visiblePointRepresentations );	
	};
	
	var doubleClick;
	var isPanning;

	var onMouseDoubleClick = function( event )
	{
		doubleClick = true;
		var cEvent = {
			gmapEvent: event,
			currentHighlightEvent: null
		};
		if( mostRecentHighlightEvent !== undefined )
		{
			//context.onHighlightClick( mostRecentHighlightEvent );
			cEvent.currentHighlightEvent = mostRecentHighlightEvent;
		}
		
		context.onSTMapDoubleClick( cEvent );

		animate();
	};

	this.onSTMapDoubleClick = function( event )
	{
	};

	/*
	 * Actiavted when a left click is detected over the map
	 * @param event <Object> object with information regarding the click action
	 */ 
	var onMouseClick = function( event )
	{
		var cEvent = 
		{
			gmapEvent: event,
			currentHighlightEvent: null
		};
		if( mostRecentHighlightEvent !== undefined )
		{
			//context.onHighlightClick( mostRecentHighlightEvent );
			cEvent.currentHighlightEvent = mostRecentHighlightEvent;
		}
		
		context.onSTMapClick( cEvent );
	};
	
	/**
	 * 
	 */
	this.onSTMapClick = function( event )
	{		
	};
	
	/*
	 * Actiavted when the mouse is moved over the map
	 * @param event <Object> object with information regarding the move action
	 */ 
	var onMouseMove = function( event )
	{
		isOnContainer = true;				
		mouseevent = event;			
	};
	
	this.onFeatureHover = function( event )
	{
		
	};
	
	this.onFeatureHoverStop = function( event )
	{
		
	};

	this.onFeatureDblClick = function( event )
	{

	};
}

/** **************************************************************** **/
/**
 * 
 */
STMAP2D.Style = function( params )
{
	this.width = ( params !== undefined && "width" in params )? params.width : 1;
	this.height = (params !== undefined && "height" in params )? params.height : 1;
	this.size = ( params !== undefined && "size" in params)? params.size : 1;
	this.rotation = ( params !== undefined && "rotation" in params)? params.rotation : null;
	
	this.alpha = ( params !== undefined && "alpha" in params)? params.alpha : 1;
	this.colour = ( params !== undefined && "colour" in params)? params.colour : null;
	this.texture = ( params !== undefined && "texture" in params)? params.texture : null;	
	//
	this.lineWidth = ( params !== undefined && "lineWidth" in params)? params.lineWidth : this.width;
	this.dashedLine = ( params !== undefined && "dashed" in params)? params.dashed : false;
	this.lineDistance = ( params !== undefined && "lineDistance" in params)? params.lineDistance : null;
	this.totalSize = ( params !== undefined && "totalSize" in params)? params.totalSize : null;
	this.dashSize = ( params !== undefined && "dashSize" in params)? params.dashSize : null;
	this.gapSize = ( params !== undefined && "gapSize" in params)? params.gapSize : null;
	//
	this.startColour = ( params !== undefined && "startColour" in params)? params.startColour : this.colour;
	this.endColour = ( params !== undefined && "endColour" in params)? params.endColour : this.colour; 
	//
	this.startAlpha = ( params !== undefined && "startAlpha" in params)? params.startAlpha : this.alpha;
	this.endAlpha = ( params !== undefined && "endAlpha" in params)? params.endAlpha : this.alpha; 
};


STMAP2D.Style.prototype = 
{
	setSize: function( size )
	{
		this.size = size;
	},
	
	setAlpha: function( alpha )
	{
		this.alpha = alpha;
	},
	
	setColour: function( colour )
	{
		this.colour = colour;
	},
	
	setRGB: function( r, g, b )
	{
		this.colour = new THREE.Colour( r, g, b );
	},
	
	setRGBA: function( r, g, b, a )
	{
		this.colour = new THREE.Colour( r, g, b );
		this.alpha = a;
	},
	
	setTexture: function( texture )
	{
		this.texture = texture;
	},
	
	setLineWidth: function( linewidth )
	{
		this.lineWidth = linewidth;
	},
	
	/**
	 * Defines the parameters to turn a line representation into a dashed line
	 * @param lineDistance <Float> distance between the line segments
	 * @param totalSize <Float> line segments size
	 * @param dashSize <Float> size of the gaps between the lines
	 */ 
	setDashLine: function( lineDistance, totalSize, dashSize )
	{
		this.dashedLine = true;
		this.lineDistance = lineDistance;
		this.totalSize = totalSize;
		this.dashSize = dashSize;
	},
	
	setPointRotation: function( rotation )
	{
		this.rotation = rotation;
	}
	// <---- needs more methods!
};
/**
 * 
 */
STMAP2D.PointStyle = function( params )
{
	STMAP2D.Style.call( this, params );
};

STMAP2D.PointStyle.prototype = new STMAP2D.Style;
/** **************************************************************** **/ 
/**
 * 
 */
STMAP2D.ParticleStyle = function( params )
{
	STMAP2D.Style.call( this, params );
};

STMAP2D.ParticleStyle.prototype = new STMAP2D.Style;
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.CubeStyle = function( params )
{
	STMAP2D.Style.call( this, params );
	this.x = ( "x" in params)? params.x : this.size;
	this.y = ( "y" in params)? params.y : this.size;
	this.z = ( "z" in params)? params.z : this.size;
};

STMAP2D.CubeStyle.prototype = new STMAP2D.Style; 
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.SphereStyle = function( params )
{
	STMAP2D.Style.call( this, params );
	this.radius = ( "radius" in params )? params.radius : this.size;
};

STMAP2D.SphereStyle.prototype = new STMAP2D.Style; 
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.CylinderStyle = function( params )
{
	STMAP2D.Style.call( this, params );
	this.radiusTop = ("topRadius" in params)? params.topRadius : this.size;
	this.radiusBottom = ("bottomRadius" in params)? params.bottomRadius : this.size;
};

STMAP2D.CylinderStyle.prototype = new STMAP2D.Style; 
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.LineStyle = function( params )
{
	STMAP2D.Style.call( this, params );
};

STMAP2D.LineStyle.prototype = new STMAP2D.Style;
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.PolyLineStyle = function( params )
{
	STMAP2D.Style.call( this, params );
	this.startLineWidth = ("startLineWidth" in params)? params.startLineWidth : this.width;
	this.endLineWidth = ("endLineWidth" in params)? params.endLineWidth : this.width; 
};

STMAP2D.PolyLineStyle.prototype = new STMAP2D.Style;
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.PlaneStyle = function( params )
{
	STMAP2D.Style.call( this, params );
};

STMAP2D.PlaneStyle.prototype = new STMAP2D.Style;

/** **************************************************************** **/

/**
 * Object used to represent a layer with information on a STMAP2D
 * @param name <String> layer's name (works as an id)
 * @param object <Object> data object containing the points 
 * @param pstyles <Array:<STMAP2D.Style>> objects representing the visual attributes of the points in this layer
 * @param lstyles <Array:<STMAP2D.Style>> objects representing the visual attributes of the lines in this layer
 */ 
STMAP2D.Layer = function( name, data )
{
	var context = this;
	this.name = name;
	this.data = data;
	this.visible = true;
	this.stmap = null;
};

STMAP2D.Layer.prototype = 
{
	/**
	 * Associates a map to this layer
	 * @param map <STMAP2D> map to be associated
	 */ 
	setSTMap: function( map )
	{
		this.stmap = map;
	},
	
	redraw: function()
	{
		this.removeLayer();
		this.drawLayer();
		this.stmap.refresh();
	},
	
	switchVisibility: function()
	{
		this.visible = !this.visible;
		this.redraw();
	}
};
/** **************************************************************** **/
/**
 * 
 */
STMAP2D.SpatioTemporalLayer = function( name, data, properties )
{
	var context = this;
	/*
	 * 
	 */
	var defaultStylePoints = function( data, dataPoint, dataPointIndex )
	{
		return new STMAP2D.ParticleStyle( {size: 1, alpha: 1.0, colour: new THREE.Color(0xff0000) } );
	};
	
	/*
	 * 
	 */
	var defaultStyleLines = function( data, dataPoint, dataPointIndex, dataPointIndex2 )
	{
		var lineStyleParams = { alpha: 1, colour: new THREE.Color(0x00ff00), lineWidth: 1, dashed: false };
		return new STMAP2D.LineStyle( lineStyleParams );
	}
	
	/*
	 * 
	 */
	var defaultStyleHighlights = function( data, dataPoint, dataPointIndex, dataPointStyle )
	{		
		return new STMAP2D.Style({ size: dataPointStyle.size+3, colour: new THREE.Color(0x00ff00) }); 
	};
	this.stylePoints = ("stylePoints" in properties)? properties.stylePoints : defaultStylePoints;
	this.styleLines = ("styleLines" in properties)? properties.styleLines : defaultStyleLines;
	this.styleHighlights = ("styleHighlights" in properties)? properties.styleHighlights : defaultStyleHighlights;
	this.zIndex = ("zIndex" in properties)? properties.zIndex : 0;

	STMAP2D.Layer.call( this, name, data );
	this.representationObjects = [];
	
	var currentHighlight = 
	{
		fid: null,
		feature: null,
		dataPointIndex: null,
		style: null,
		hstyle: null,
		hobject: null
	};
	
	this.getRepresentationVisiblePoints = function()
	{
		var points = [];

		var inspectAndInsertDataPoint = function( dataPoint, points )
		{
			if( $.inArray(dataPoint, points) === -1 )
				points.push( dataPoint );
			return points;
		};

		for( var i = 0; i < this.representationObjects.length; i++ )
		{
			if( this.representationObjects[i] instanceof THREE.ParticleSystem || this.representationObjects[i] instanceof THREE.PointCloud )
			{
				for( var j = 0; j < this.representationObjects[i].geometry.vertices.length; j++ )
					points = inspectAndInsertDataPoint( this.data.points[ this.representationObjects[i].fdpi+j ], points );
			}
			else if( this.representationObjects[i] instanceof THREE.Line )
			{
				for( var j = 0; j < this.representationObjects[i].geometry.vertices.length; j++ )
				{
					var v = this.representationObjects[i].geometry.vertices[j].dpi;
					points = inspectAndInsertDataPoint( this.data.points[ v ], points );
				}					
			}
			else if( this.representationObjects[i].objtype === STMAP2D.UTILS.OBJECT_TYPES.POLYLINE )
			{				
				var sPoint = this.data.points[ this.representationObjects[i].sdpi ];
				var ePoint = this.data.points[ this.representationObjects[i].edpi ];
				points = inspectAndInsertDataPoint( sPoint, points );
				points = inspectAndInsertDataPoint( ePoint, points );
			}
			else // all others
			{
				var dpi = this.representationObjects[i].dpi;
				points = inspectAndInsertDataPoint( this.data.points[ dpi ], points );
			}					
		}

		return points;
	};
		
	this.drawLayer = function()
	{
		var layerObjects = [];
		if( this.visible )
		{		
			layerObjects = layerObjects.concat( createObjectPoints() );
			layerObjects = layerObjects.concat( createObjectLines() );
			this.representationObjects = layerObjects;
			//console.log( ">>>>>", layerObjects );
			for( var i = 0; i < layerObjects.length; i++ )
			{
				this.stmap.maplayer.add( layerObjects[i] );
			}			
			this.stmap.refresh();			
		}
	};
	
	/*
	 * 
	 */
	var createObjectPoints = function()
	{				
		if( context.stylePoints === null ) return [];
		
		var pointObjects  = [];
		
		var data = context.data;	
		var dataPointIndex = 0;
		
		while( dataPointIndex < data.points.length )
		{
			var pointStyle = context.stylePoints( data, data.points[dataPointIndex], dataPointIndex );			
			if( pointStyle !== null )
			{
				var result;
				if( pointStyle instanceof STMAP2D.ParticleStyle || pointStyle instanceof STMAP2D.PointStyle )			
					result = createParticlePoints( data, dataPointIndex );			
				else if( pointStyle instanceof STMAP2D.CubeStyle )
					result = createCubePoints( data, dataPointIndex );								
				else if( pointStyle instanceof STMAP2D.SphereStyle )
					result = createSpherePoints( data, dataPointIndex );
				else if( pointStyle instanceof STMAP2D.PlaneStyle )
					result = createPlanePoints( data, dataPointIndex );
					
				pointObjects = pointObjects.concat( result.objs );
				dataPointIndex = result.dpi;				
			}
			else
				dataPointIndex++;					
		}
		
		return pointObjects;	
	};
	
	/*
	 * 
	 */
	var createObjectLines = function()
	{
		if( context.styleLines === null || context.data.points.length <= 1 ) return [];
		
		lineObjects = [];
		var data = context.data;
		var dataPointIndex = 0;
		
		while( dataPointIndex < data.points.length )
		{			
			var lineStyle = context.styleLines( data, data.points[dataPointIndex], dataPointIndex, dataPointIndex+1 );
			if( lineStyle !== null )	
			{
				var result;
				if( lineStyle instanceof STMAP2D.PolyLineStyle )								
					result = createPolyLines( data, dataPointIndex );				
				else if( lineStyle instanceof STMAP2D.LineStyle || lineStyle instanceof STMAP2D.Style )								
					result = createNormalLines( data, dataPointIndex );			
				lineObjects = lineObjects.concat( result.objs );
				dataPointIndex = result.dpi;				
			}
			else
				dataPointIndex++;		
		}
		//console.log( lineObjects.length, context.data.points.length );
		
		return lineObjects;
	};
	
	// #################################### POINTS-START ####################################	
	/*
	 * 
	 */
	var createCubePoints = function( data, pointIndex )
	{
		var cubeObjects = [];
		var style = context.stylePoints(data, data.points[pointIndex], pointIndex );
		
		while( style !== null && (style instanceof STMAP2D.CubeStyle) && (pointIndex < data.points.length) )
		{
			var point = data.points[pointIndex];
			var location = new google.maps.LatLng( point.latitude, point.longitude );				
			var vertex = context.stmap.maplayer.fromLatLngToVertex(location);			
			vertex.z = 0 + context.zIndex; //?	
			
			style = context.stylePoints(data, data.points[pointIndex], pointIndex );
			
			if( style instanceof STMAP2D.CubeStyle )
			{
				var materialProperties = {};
				materialProperties.transparent = true;			
				materialProperties.color = ( style.colour != null )? style.colour: 0xff0000;
				materialProperties.opacity = (style.alpha != null)? style.alpha: 1;
				
				if( style.texture != null && style.texture != undefined ) 
					materialProperties.map = style.texture;
				var psx = style.x/context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				var psy = style.y/context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				var psz = style.z/context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				
				var pointMaterial = new THREE.MeshBasicMaterial( materialProperties );
				var cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pointMaterial );
				cube.scale.set( psx, psy, psz );
				/*cube.scale.x = psx;
				cube.scale.y = psy;
				cube.scale.z = psz;*/
				cube.overdraw = true;
				cube.layer = context.name;
				cube.objtype = STMAP2D.UTILS.OBJECT_TYPES.CUBE_POINT;
				cube.datauuid = context.data.uuid;
				cube.dpi = pointIndex;
				cube.name = context.data.name+"_"+cube.objtype;
				cube.position.x = vertex.x;
				cube.position.y = vertex.y;
				cube.position.z = vertex.z;
				cube.display = true;				
				cubeObjects.push( cube );
				
				pointIndex ++;
			}			  
		}		
		return { objs: cubeObjects, dpi: pointIndex/*, spi: styleIndex*/ };
	};
	
	/*
	 * 
	 */
	var createSpherePoints = function( data, pointIndex )
	{
		var sphereObjects = [];
		var style = context.stylePoints(data, data.points[pointIndex], pointIndex ); 
		
		while( style !== null && (style instanceof STMAP2D.SphereStyle) && pointIndex < data.points.length )
		{
			var point = data.points[pointIndex];
			var location = new google.maps.LatLng( point.latitude, point.longitude );				
			var vertex = context.stmap.maplayer.fromLatLngToVertex(location);
			vertex.z = 0 + context.zIndex; //?	
			
			//var vertex = context.stc.stpoint2stc( point );
			
			style = context.stylePoints(data, data.points[pointIndex], pointIndex );
			
			if( style instanceof STMAP2D.SphereStyle )
			{
				var materialProperties = {};
				materialProperties.transparent = true;			
				materialProperties.color = ( style.colour != null )? style.colour: 0xff0000;
				materialProperties.opacity = (style.alpha != null)? style.alpha: 1;			
				
				if( style.texture != null && style.texture != undefined ) materialProperties.map = style.texture;
				var pointRadius = style.radius;
				
				var pointMaterial = new THREE.MeshBasicMaterial( materialProperties );
				var sphere = new THREE.Mesh(new THREE.SphereGeometry( pointRadius, 8, 8), pointMaterial );
				sphere.overdraw = true;
				sphere.layer = context.name;
				sphere.objtype = STMAP2D.UTILS.OBJECT_TYPES.SPHERE_POINT;
				sphere.datauuid = context.data.uuid;
				sphere.dpi = pointIndex;
				sphere.name = context.data.name+"_"+sphere.objtype;
				sphere.position.x = vertex.x;
				sphere.position.y = vertex.y;
				sphere.position.z = vertex.z;
				sphere.display = true;
				
				sphereObjects.push( sphere);			
				//if( styles.length > 1 ) styleIndex ++;
				pointIndex ++;
			}			  
		}
		
		return { objs: sphereObjects, dpi: pointIndex/*, spi: styleIndex*/ };
	};
	
	/*
	 * 
	 */
	var createPlanePoints = function( data, pointIndex )
	{
		var planeObjects = [];
		var style = context.stylePoints(data, data.points[pointIndex], pointIndex ); 
		
		while( style !== null && (style instanceof STMAP2D.PlaneStyle) && pointIndex < data.points.length )
		{
			var point = data.points[pointIndex];
			style = context.stylePoints(data, point, pointIndex );
			
			if( style instanceof STMAP2D.PlaneStyle )
			{
				var location = new google.maps.LatLng( point.latitude, point.longitude );				
				var vertex = context.stmap.maplayer.fromLatLngToVertex(location);			
				vertex.z = 0 + context.zIndex; //?	
				
				var materialProperties = {};
				materialProperties.transparent = true;			
				materialProperties.color = ( style.colour != null )? style.colour: 0xff0000;
				materialProperties.opacity = (style.alpha != null)? style.alpha: 1;			
				materialProperties.side = THREE.DoubleSide;
				
				if( style.texture != null && style.texture != undefined ) materialProperties.map = style.texture;
				var pwidth = (style.width != null && style.width != undefined )? style.width : 5;
				var pheight = (style.height != null && style.height != undefined )? style.height : 5;
				pwidth /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				pheight /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;

				var planeMaterial = new THREE.MeshBasicMaterial( materialProperties );				
				
				var plane = new THREE.Mesh( new THREE.PlaneBufferGeometry( 1, 1), planeMaterial );
				plane.scale.x = pwidth;
				plane.scale.y = pheight;
				plane.overdraw = true;
				plane.layer = context.name;
				plane.objtype = STMAP2D.UTILS.OBJECT_TYPES.PLANE_POINT;
				plane.datauuid = context.data.uuid;
				plane.dpi = pointIndex;
				plane.name = context.data.name+"_"+plane.objtype;
				plane.position.x = vertex.x;
				plane.position.y = vertex.y;
				plane.position.z = vertex.z;
				plane.display = true;
				planeObjects.push( plane );
				
				pointIndex ++;
			}			  
		}
		
		return { objs: planeObjects, dpi: pointIndex };
	};	
	
	/*
	 * 
	 */
	var createParticlePoints = function( data, pointIndex )
	{
		/* */
		var createParticleSystem = 
			function( useSize, useAlpha, useColour, useRotation, useTexture, uniforms, attributes, geometry, fdpi )
		{
			var shaderStyleSeed = {};
			shaderStyleSeed.size = useSize;
			shaderStyleSeed.alpha = useAlpha;
			shaderStyleSeed.color = useColour;
			shaderStyleSeed.rotation = useRotation;
			if( useTexture ) shaderStyleSeed.texture = useTexture;
		
			var particleMaterial = new THREE.ShaderMaterial( {
				uniforms: uniforms,
				attributes: attributes,
				vertexShader: STMAP2D.UTILS.generateParticleVertexShader( shaderStyleSeed ),
				fragmentShader: STMAP2D.UTILS.generateParticleFragmentShader( shaderStyleSeed ),							 
				transparent: true,
				side: THREE.DoubleSide				
			});		
			particleMaterial.transparent = true;
			
			// rever esta parte 
			var part = new THREE.ParticleSystem( geometry, particleMaterial );		
			part.dynamic = true;
			part.sortParticles = true;
			part.layer = context.name;
			part.datauuid = context.data.uuid;
			part.objtype = STMAP2D.UTILS.OBJECT_TYPES.PARTICLE_POINT;//"trajpoints";
			part.name = context.data.name+"_"+part.objtype;			
			part.display = true;
			part.fdpi = fdpi;
			
			return part;
		};
		// ------
		var style = context.stylePoints( data, data.points[pointIndex], pointIndex );	
		var particleObjects = [];
		
		var geometry, uniforms, attributes, hasTexture, fdpi; 
		var createNew = true;
		var lastTexture = null;
		
		while( style !== null && ((style instanceof STMAP2D.ParticleStyle) || (style instanceof STMAP2D.PointStyle)) 
							  && pointIndex < data.points.length )
		{
			style = context.stylePoints(data, data.points[pointIndex], pointIndex );
			
			if( style !== null )
			{
				if( style.texture !== undefined && style.texture !== null )
				{
					if( lastTexture !== null && style.texture.sourceFile !== lastTexture.sourceFile )
					{
						var part = createParticleSystem( true, true, true, true, hasTexture, uniforms, attributes, geometry, fdpi );
						createNew = true;										
						particleObjects.push( part );
					}	
					else
					{
						//if( !hasTexture ) uniforms.texture = { type: "t", value: style.texture };
						//hasTexture = true;
					}
					hasTexture = true;
					lastTexture = style.texture;
				}
			}
			else
			{
				createNew = true;
			}

			if( style !== null && createNew )
			{
				geometry = new THREE.Geometry();
				uniforms = {};
				if( hasTexture )
				{
					uniforms.texture = { type: "t", value: lastTexture };
				}
				attributes = STMAP2D.UTILS.createAttributesObject();
				//hasTexture = false;
				fdpi = pointIndex;
				createNew = false; 
			}

			if( style !== null )
			{
				var point = data.points[ pointIndex ];
				var location = new google.maps.LatLng( point.latitude, point.longitude );				
				var vertex = context.stmap.maplayer.fromLatLngToVertex( location );
				vertex.z = 0 + context.zIndex; //?				
				geometry.vertices.push( vertex );
				
				attributes.size.value.push( ( style.size != null )? style.size : 3 );
				attributes.alpha.value.push( ( style.alpha != null )? style.alpha : 1.0 );
				attributes.colour.value.push( ( style.colour != null)? style.colour: new THREE.Color(0xff0000) );
				attributes.rotation.value.push( ( style.rotation != null)? style.rotation: Math.PI );
			}
			pointIndex ++;					  	
		}

		var part = createParticleSystem( true, true, true, true, hasTexture, uniforms, attributes, geometry, fdpi );		
		particleObjects.push( part );
		//console.log( "pO", particleObjects );
		return { objs: particleObjects, dpi: pointIndex };		
	};
	
	// #################################### POINTS-END ####################################
	
	// #################################### LINES-START ####################################
	/*
	 * 
	 */
	var createNormalLines = function( data, dataPointIndex )
	{
		var lineObjects = [];
		var uniforms = {};
		var attributes = {
			alpha: { type: "f", value: [] },
			colour: { type: "c", value: [] },
			lineDistance: { type: "f", value: [] },
			totalSize: { type: "f", value: [] },
			dashSize: { type: "f", value: [] }
		};						
		var hasDashed = false;
		var hasLineWidth = false;
		var mostRecentLineWidth = 1;
		
		var geometry = new THREE.Geometry();
		var style = context.styleLines( data, data.points[dataPointIndex], dataPointIndex, dataPointIndex+1 );//pstyles[pointStyleIndex];
		var lastStyle = style;
		var attributeIndex = 0;
		
		while(  (dataPointIndex < data.points.length-1) && 
				style !== null && ((style instanceof STMAP2D.LineStyle) || (style instanceof STMAP2D.Style)) )
		{
			// needs compensation
			var needsCompensation = 
				(attributeIndex == 0 || 
					(style.startAlpha !== lastStyle.endAlpha || style.startColour.getHex() !== lastStyle.endColour.getHex()));
						
			if( needsCompensation )
			{
				var point1 = data.points[ dataPointIndex ];
				var location1 = new google.maps.LatLng( point1.latitude, point1.longitude );
				var vertex1 = context.stmap.maplayer.fromLatLngToVertex( location1 );
				vertex1.z -= 50 + context.zIndex;			
				vertex1.dpi = dataPointIndex;
				geometry.vertices.push( vertex1 );
				
				attributes.colour.value.push( //[attributeIndex] = 
					(style.startColour !== null)? style.startColour : new THREE.Color(0xff0000) );
				attributes.alpha.value.push( //[attributeIndex] = 
					(style.startAlpha !== null)? style.startAlpha : 1 );
				
				if( style.dashedLine )
				{
					hasDashed = true;				
					var gapSize = ( "gapSize" in style )? style.gapSize: 1.0;
					var dashSize = ("dashSize" in style )? style.dashSize: 1.0;
					attributes.totalSize.value.push( dashSize+gapSize );
					attributes.dashSize.value.push( dashSize );
				}				
			}
			
			var point2 = data.points[ dataPointIndex+1 ];
			var location2 = new google.maps.LatLng( point2.latitude, point2.longitude );			
			var vertex2 = context.stmap.maplayer.fromLatLngToVertex( location2 );
			vertex2.z -= 50 + context.zIndex;			
			vertex2.dpi = dataPointIndex +1 ;			
			geometry.vertices.push( vertex2 );
			
			attributes.colour.value.push( (style.endColour !== null)? style.endColour : 
				new THREE.Color(0x00ff00) );		
			attributes.alpha.value.push( (style.endAlpha !== null)? 
				style.endAlpha : 1 );
							
			if( style.dashedLine )
			{
				hasDashed = true;				
				var gapSize = ( "gapSize" in style )? style.gapSize: 1.0;
				var dashSize = ("dashSize" in style )? style.dashSize: 1.0;
				
				attributes.totalSize.value.push( dashSize+gapSize );
				attributes.dashSize.value.push( dashSize );
				attributes.totalSize.value.push( dashSize+gapSize );
				attributes.dashSize.value.push( dashSize );
			}
			
			if( style.lineWidth !== null )
			{
				hasLineWidth = true;
				mostRecentLineWidth = style.lineWidth;
			}
			
			lastStyle = style;
			dataPointIndex++;
			attributeIndex+=2;
			
			if( dataPointIndex < data.points.length-1 )
				style = context.styleLines( data, data.points[dataPointIndex], dataPointIndex, dataPointIndex+1 );			
			else
				dataPointIndex ++;
		}
		
		var shaderStyleSeed = { alpha : true, color: true };
					
		if( hasDashed )
		{			
			shaderStyleSeed.dashed = true;
			geometry.computeLineDistances();
			for( var i = 0; i < geometry.lineDistances.length; i++ )
				attributes.lineDistance.value[i] = geometry.lineDistances[i];
		}
				
		var linesMaterial = new THREE.ShaderMaterial( {
			uniforms: uniforms,
			attributes: attributes,
			vertexShader: STMAP2D.UTILS.generateLineVertexShader( shaderStyleSeed ),
			fragmentShader: STMAP2D.UTILS.generateLineFragmentShader( shaderStyleSeed ),			
			transparent: true			
		});
											
		linesMaterial.linewidth = mostRecentLineWidth;		
		
		var line = new THREE.Line( geometry, linesMaterial );
		line.layer = context.name;
		line.objtype = STMAP2D.UTILS.OBJECT_TYPES.LINE;
		line.name = context.data.name+"_"+line.objtype;		
		line.display = true;
		line.datauuid = data.uuid;
		line.verticesNeedUpdate = true;
		lineObjects.push(line);
	
		return { objs: lineObjects, dpi: dataPointIndex };	
	};
	
	/*
	 * 
	 */
	var createPolyLines = function( data, dataPointIndex )
	{
		var polyLinesObjects = [];
		var sStyle = context.styleLines( data, data.points[dataPointIndex], dataPointIndex, dataPointIndex+1 );
		while( (sStyle instanceof STMAP2D.PolyLineStyle) && (dataPointIndex < data.points.length-1) )
		{
			var uniforms = {};
			var attributes = {
				alpha: {type: "f", value: [] },
				colour: {type:"c", value: [] }
			};
								
			var sPoint = data.points[ dataPointIndex ];			
			var ePoint = data.points[ dataPointIndex+1 ];			
			var sLocation = new google.maps.LatLng( sPoint.latitude, sPoint.longitude );				
			var sVertex = context.stmap.maplayer.fromLatLngToVertex( sLocation );
			sVertex.z = 0 + context.zIndex;
			var eLocation = new google.maps.LatLng( ePoint.latitude, ePoint.longitude );				
			var eVertex = context.stmap.maplayer.fromLatLngToVertex( eLocation );
			eVertex.z = 0 + context.zIndex;
									
			sStyle = context.styleLines( data, data.points[dataPointIndex], dataPointIndex, dataPointIndex+1 );
			//var eStyle = context.styleLines( data, data.points[dataPointIndex+1], dataPointIndex+1, dataPointIndex );			

			if( sStyle !== null ) //&& eStyle !== null )
			{
				var sWidth = ( sStyle.startLineWidth != null)? sStyle.startLineWidth/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10) : 1/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10);
				var eWidth = ( sStyle.endLineWidth != null)? sStyle.endLineWidth/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10) : 1/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10);
				var faces = 8;		
				var sColour = (sStyle.startColour != null)? sStyle.startColour : new THREE.Color(0xff0000);
				var eColour = (sStyle.endColour != null)? sStyle.endColour : new THREE.Color(0xff0000);
				var sAlpha = (sStyle.startAlpha != null)? sStyle.startAlpha : 1;
				var eAlpha = (sStyle.endAlpha != null)? sStyle.endAlpha : 1; 
					
				var geometry = new THREE.CylinderGeometry( sWidth, eWidth, 1, faces );
				geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / -2 ) );
				
				for( var i = 0; i < geometry.vertices.length; i ++ )
				{
					if( i < geometry.vertices.length/2 - 1 || i == geometry.vertices.length - 2 ) 
					{
						attributes.colour.value[i] = sColour;
						attributes.alpha.value[i] = sAlpha;
					}
					else if( i >= geometry.vertices.length/2-1 )
					{
						attributes.colour.value[i] = eColour;
						attributes.alpha.value[i] = eAlpha;
					}
				}
				var shaderStyleSeed = {};
				shaderStyleSeed.alpha = true;
				shaderStyleSeed.color = true;
							
				var material = new THREE.ShaderMaterial( {
					uniforms: uniforms,
					attributes: attributes,
					vertexShader: STMAP2D.UTILS.generateLineVertexShader( shaderStyleSeed ),
					fragmentShader: STMAP2D.UTILS.generateLineFragmentShader( shaderStyleSeed ),
					transparent: true
				});							
							
				var subline = new THREE.Mesh( geometry, material );
				subline.position.x = sVertex.x;
				subline.position.y = sVertex.y;
				subline.position.z = sVertex.z;
				subline.lookAt( eVertex );
				
				var dist = sVertex.distanceTo( eVertex );
				subline.scale.set( 1, 1, dist );
				subline.translateZ( 0.5*dist );
				subline.position.z -= 1;
				
				subline.overdraw = true;
				subline.layer = context.name;
				subline.objtype = STMAP2D.UTILS.OBJECT_TYPES.POLYLINE;
				subline.name = data.name+"_"+subline.objtype;
				subline.datauuid = data.uuid;
				subline.sdpi = dataPointIndex;
				subline.edpi = dataPointIndex+1;			
				/*subline.position.x = sVertex.x;
				subline.position.y = sVertex.y;
				subline.position.z = sVertex.z;*/
				subline.display = true;
				
				polyLinesObjects.push( subline );
			}			
			
			dataPointIndex ++;
		}
	
		return { objs: polyLinesObjects, 
				 dpi: (dataPointIndex == data.points.length-1)? dataPointIndex+1 : dataPointIndex
		};
	};
	
	// #################################### LINES-END ####################################
	
	/**
	 * 
	 */
	this.removeLayer = function()
	{
		for( var i = 0; i < this.representationObjects.length; i++ )
			this.stmap.maplayer.scene.remove( this.representationObjects[i] );
		//this.stmap.refresh();
	};
	
	/**
	 * 
	 */
	this.highlightFeature = function( feature, dataPointIndex, vertexPoint, vertexPoint2 )
	{
		if( this.styleHighlights === null ) return null;	
		//this.removeHighlight();
		if( currentHighlight !== null && currentHighlight.feature !== null )
			if( currentHighlight.feature.uuid !== feature.uuid )
			{
				this.removeHighlight();
			}
			else
				return null;
		
		var dataPoint = this.data.points[ dataPointIndex ];
		
		if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.PARTICLE_POINT )
		{
			// #1 - adicionar particula
			var dStyle = this.stylePoints( this.data, dataPoint, dataPointIndex);
			var hStyle = this.styleHighlights( this.data, dataPoint, dataPointIndex, dStyle );
			
			var geometry = new THREE.Geometry();
			var uniforms = {};
			var attributes = STMAP2D.UTILS.createAttributesObject();		
			var hasTexture = hStyle.texture !== undefined && hStyle.texture !== null;
			if( hasTexture ) uniforms.texture = { type: "t", value: hStyle.texture };					
			
			var location = new google.maps.LatLng( dataPoint.latitude, dataPoint.longitude );				
			var vertex = context.stmap.maplayer.fromLatLngToVertex( location );
			//var vertex = this.stc.stpoint2stc( dataPoint );
			geometry.vertices.push( vertex );
			
			attributes.size.value.push( ( hStyle.size !== null )? hStyle.size : dStyle.size );
			attributes.alpha.value.push( ( hStyle.alpha !== null )? hStyle.alpha : dStyle.alpha );
			attributes.colour.value.push( ( hStyle.colour !== null)? hStyle.colour: dStyle.colour );
			attributes.rotation.value.push( ( hStyle.rotation !== null)? hStyle.rotation: Math.PI );//dStyle.rotation );
			
			//-------------
			var part = createHParticleSystem( true, true, true, true, hasTexture, uniforms, attributes, geometry );
			this.stmap.maplayer.scene.add( part );			
			
			currentHighlight.feature 		= feature;
			currentHighlight.dataPointIndex = dataPointIndex;
			currentHighlight.style 			= dStyle;
			currentHighlight.hstyle 		= hStyle;
			currentHighlight.hobject 		= part;
			currentHighlight.hobjectIndex 	= vertexPoint;
			
			// #2 - tornar a particula em highlight invisivel
			feature.material.attributes.alpha.value[ vertexPoint ] = 0;
		}
		else if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.CUBE_POINT || 
				 feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.SPHERE_POINT ||
				 feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.PLANE_POINT )
		{

			if( feature.id !== currentHighlight.fid )
			{
				var pointStyle = this.stylePoints( this.data, dataPoint, dataPointIndex);
				var newStyle = this.styleHighlights( this.data, dataPoint, dataPointIndex, pointStyle );
							
				var featureMaterial = feature.material;			
				featureMaterial.color = ( newStyle.colour !== null )? newStyle.colour: pointStyle.colour;
				featureMaterial.opacity = (newStyle.alpha !== null)? newStyle.alpha: pointStyle.alpha;			
				if( newStyle.texture !== null && newStyle.texture !== undefined ) 
					featureMaterial.map = newStyle.texture;
				
				featureMaterial.needsUpdate = true;
				if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.CUBE_POINT )
				{
					var fsx, fsy, fsz;
					fsx = ("x" in newStyle)? newStyle.x : ( ("size" in newStyle)? newStyle.size : pointStyle.x );
					fsy = ("y" in newStyle)? newStyle.y : ( ("size" in newStyle)? newStyle.size : pointStyle.y );
					fsz = ("z" in newStyle)? newStyle.z : ( ("size" in newStyle)? newStyle.size : pointStyle.z );

					fsx /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
					fsy /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
					fsz /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;

					feature.scale.set( fsx, fsy, fsz );
				}
				else if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.SPHERE_POINT )
				{
					feature.geometry.radius = ("radius" in newStyle)? newStyle.radius : pointStyle.radius;
				}
				else if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.PLANE_POINT )
				{
					var pwidth = ("width" in newStyle)? newStyle.width : ( ("size" in newStyle)? newStyle.size : pointStyle.width );
					var pheight = ("height" in newStyle)? newStyle.height : ( ("size" in newStyle)? newStyle.size : pointStyle.height );

					pwidth /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
					pheight /= context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;

					feature.scale.x = pwidth;
					feature.scale.y = pheight;				
				}

				currentHighlight.fid 			= feature.id;
				currentHighlight.feature 		= feature;
				currentHighlight.dataPointIndex = dataPointIndex;
				currentHighlight.style 			= pointStyle;
				currentHighlight.hstyle 		= newStyle;								
				currentHighlight.hobject 		= null;	
			}			
		}
		else if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.LINE )
		{		
			var dataSPoint = feature.geometry.vertices[vertexPoint].dpi;
			var dataEPoint = feature.geometry.vertices[vertexPoint+1].dpi;
			var startDataPoint = this.data.points[ dataSPoint ];
			var endDataPoint = this.data.points[ dataEPoint ];
			
			var lineStyle = this.styleLines( this.data, startDataPoint, dataSPoint, dataEPoint ); 
			var hStyle = this.styleHighlights( this.data, startDataPoint, dataSPoint, lineStyle );
					
			feature.material.attributes.colour.value[ vertexPoint ] = 
				( hStyle.startColour !== null )? hStyle.startColour: lineStyle.startColour;
			feature.material.attributes.colour.value[ vertexPoint2 ] = 
				( hStyle.endColour !== null )? hStyle.endColour: lineStyle.endColour;
			feature.material.attributes.alpha.value[ vertexPoint ] = 
				( hStyle.startAlpha !== null )? hStyle.startAlpha: lineStyle.startAlpha;
			feature.material.attributes.alpha.value[ vertexPoint2 ] = 
				( hStyle.endAlpha !== null )? hStyle.endAlpha: lineStyle.endAlpha;
			
			feature.material.attributes.colour.needsUpdate = ( hStyle.startColour !== null  || hStyle.endColour !== null );
			
			feature.material.needsUpdate = true;
			feature.geometry.verticesNeedUpdate = true;
			feature.geometry.dynamic = true;
			
			currentHighlight.feature = feature;
			currentHighlight.dataPointIndex = dataSPoint;
			currentHighlight.dataPointIndex2 = dataEPoint;
			currentHighlight.vertexIndex1 = vertexPoint;
			currentHighlight.vertexIndex2 = vertexPoint2;
			currentHighlight.style = lineStyle;
			currentHighlight.hstyle = hStyle;								
			currentHighlight.hobject = null;		
		}
		else if( feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.POLYLINE )
		{
			var startDataPoint = this.data.points[ vertexPoint ];
			var endDataPoint = this.data.points[ vertexPoint2 ];
			//var sStyle = this.styleLines( this.data, startDataPoint, vertexPoint, vertexPoint2 ); 
			//var eStyle = this.styleLines( this.data, endDataPoint, vertexPoint2, vertexPoint );
			var lStyle = this.styleLines( this.data, startDataPoint, vertexPoint, vertexPoint2 ); 
			
			//var hStartStyle = this.styleHighlights( this.data, startDataPoint, vertexPoint, sStyle ); 
			//var hEndStyle = this.styleHighlights( this.data, endDataPoint, vertexPoint2, eStyle );
			var hlStyle = this.styleHighlights( this.data, startDataPoint, vertexPoint, lStyle ); 
			
			//var sWidth = ( hlStyle.startLineWidth !== null)? hlStyle.startLineWidth : 1;
			//var eWidth = ( hlStyle.endLineWidth !== null)? hlStyle.endLineWidth : 1;
			var sWidth = ( hlStyle.startLineWidth != null)? hlStyle.startLineWidth/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10) : 1/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10);
			var eWidth = ( hlStyle.endLineWidth != null)? hlStyle.endLineWidth/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10) : 1/(context.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10);

			var faces = 8;		
			var sColour = ( hlStyle.startColour !== null)? hlStyle.startColour : new THREE.Color(0xff0000);
			var eColour = ( hlStyle.endColour !== null)? hlStyle.endColour : new THREE.Color(0xff0000);
			var sAlpha = ( hlStyle.startAlpha !== null)? hlStyle.startAlpha : 1;
			var eAlpha = ( hlStyle.endAlpha !== null)? hlStyle.endAlpha : 1; 
			
			//feature.geometry.dispose();
			//feature.geometry = new THREE.CylinderGeometry( sWidth, eWidth, 1, faces );
			//feature.geometry.radiusTop = sWidth;
			//feature.geometry.radiusBottom = eWidth;

			feature.geometry.dispose();

			feature.geometry = new THREE.CylinderGeometry(
				sWidth,
				eWidth,
				1,
				8
			);
			feature.geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / -2 ) );

			feature.geometry.computeBoundingSphere();
			//feature.geometry.vertices.needsUpdate = true;
						
			for( var i = 0; i < feature.geometry.vertices.length; i ++ )
			{
				if( i < feature.geometry.vertices.length/2 - 1 || i == feature.geometry.vertices.length - 2 ) 
				{
					feature.material.attributes.colour.value[i] = sColour;
					feature.material.attributes.alpha.value[i] = sAlpha;
				}
				else if( i >= feature.geometry.vertices.length/2-1 )
				{
					feature.material.attributes.colour.value[i] = eColour;
					feature.material.attributes.alpha.value[i] = eAlpha;
				}
			}
			
			feature.material.attributes.colour.needsUpdate = true;
			feature.material.attributes.alpha.needsUpdate = true;
			
			currentHighlight.feature = feature;
			currentHighlight.dataPointIndex = vertexPoint;
			currentHighlight.dataPointIndex2 = vertexPoint2;
			currentHighlight.style = lStyle;
			//currentHighlight.style2 = eStyle;
			currentHighlight.hstyle = hlStyle;//hStartStyle;
			//currentHighlight.hstyle2 = hEndStyle;								
			currentHighlight.hobject = null;
		}
		this.stmap.maplayer.render();
		
	};// end of this.highlightFeature
	
	var createHParticleSystem = function( useSize, useAlpha, useColour, useRotation, useTexture, uniforms, attributes, geometry )
	{
		var shaderStyleSeed = {};
		shaderStyleSeed.size = useSize;
		shaderStyleSeed.alpha = useAlpha;
		shaderStyleSeed.color = useColour;
		shaderStyleSeed.rotation = useRotation;
		if( useTexture ) shaderStyleSeed.texture = useTexture;
	
		var particleMaterial = new THREE.ShaderMaterial( {
			uniforms: uniforms,
			attributes: attributes,
			vertexShader: STMAP2D.UTILS.generateParticleVertexShader( shaderStyleSeed ),
			fragmentShader: STMAP2D.UTILS.generateParticleFragmentShader( shaderStyleSeed ),							 
			transparent: true,
			side: THREE.DoubleSide				
		});		
		particleMaterial.transparent = true;
		
		// rever esta parte 
		var part = new THREE.ParticleSystem( geometry, particleMaterial );		
		part.dynamic = true;
		part.sortParticles = true;
		part.layer = context.name;
		part.datauuid = context.data.uuid;
		part.objtype = STMAP2D.UTILS.OBJECT_TYPES.H_PARTICLE_POINT;
		part.name = context.data.name+"_"+part.objtype;			
		part.display = true;
		
		return part;
	};
	
	/**
	 * 
	 */
	this.removeHighlight = function()
	{
		if( currentHighlight.feature === null ) return;
		
		if( currentHighlight.hobject !== null )
		{
			this.stmap.maplayer.scene.remove( currentHighlight.hobject );
			currentHighlight.hobject = null;
		}
		
		if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.PARTICLE_POINT )
		{			
			currentHighlight.feature.material.attributes.alpha.value[ currentHighlight.hobjectIndex  ] = currentHighlight.style.alpha;	
		}
		else if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.CUBE_POINT || 
				 currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.SPHERE_POINT || 
				 currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.PLANE_POINT )
		{		
			var featureMaterial = currentHighlight.feature.material;
			if( currentHighlight.style.colour !== null )
				featureMaterial.color = currentHighlight.style.colour;
			if( currentHighlight.style.opacity!== null )
				featureMaterial.opacity = currentHighlight.style.alpha;			
			if( currentHighlight.style.texture !== null && currentHighlight.style.texture !== undefined ) 
			{
				featureMaterial.map = currentHighlight.style.texture;
				featureMaterial.needsUpdate = true;	
			}
			
			if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.CUBE_POINT )
			{
				var fsx = currentHighlight.style.x/this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				var fsy = currentHighlight.style.y/this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				var fsz = currentHighlight.style.z/this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;

				currentHighlight.feature.scale.set( fsx, fsy, fsz );
			}
			else if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.SPHERE_POINT )
			{
				currentHighlight.feature.geometry.radius = currentHighlight.style.radius;
			}
			else if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.PLANE_POINT )
			{
				var fsx = currentHighlight.style.width/this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;
				var fsy = currentHighlight.style.height/this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR;

				currentHighlight.feature.scale.x = fsx;
				currentHighlight.feature.scale.y = fsy;	
			}
		}
		else if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.LINE )
		{			
			var lStyle = this.styleLines( this.data, this.data.points[ currentHighlight.dataPointIndex ], currentHighlight.dataPointIndex, currentHighlight.dataPointIndex2 );
			//var eStyle = this.styleLines( this.data, this.data.points[ currentHighlight.dataPointIndex2 ], currentHighlight.dataPointIndex2, currentHighlight.dataPointIndex );
			
			currentHighlight.feature.material.attributes.colour.value[ currentHighlight.vertexIndex1 ] = lStyle.startColour;
			currentHighlight.feature.material.attributes.colour.value[ currentHighlight.vertexIndex2 ] = lStyle.endColour;
			
			currentHighlight.feature.material.attributes.alpha.value[ currentHighlight.vertexIndex1 ] = lStyle.startAlpha;
			currentHighlight.feature.material.attributes.alpha.value[ currentHighlight.vertexIndex2 ] = lStyle.endAlpha;
			
			currentHighlight.feature.material.attributes.colour.needsUpdate = true;				
		}
		else if( currentHighlight.feature.objtype === STMAP2D.UTILS.OBJECT_TYPES.POLYLINE )
		{
			//console.log("!!!!!!!___");
			//var sStyle = this.styleLines( this.data, this.data.points[ currentHighlight.dataPointIndex ], currentHighlight.dataPointIndex, currentHighlight.dataPointIndex2 );
			//var eStyle = this.styleLines( this.data, this.data.points[ currentHighlight.dataPointIndex2 ], currentHighlight.dataPointIndex2, currentHighlight.dataPointIndex );
			var lStyle = this.styleLines( this.data, this.data.points[ currentHighlight.dataPointIndex ], currentHighlight.dataPointIndex, currentHighlight.dataPointIndex2 );
			
			currentHighlight.feature.geometry.dispose();
			currentHighlight.feature.geometry = 
				new THREE.CylinderGeometry( 
					currentHighlight.style.startLineWidth/(this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10), 
					currentHighlight.style.endLineWidth/(this.stmap.NON_PARTICLE_SIZE_REDUCTION_FACTOR*10), -1, 8 );
			currentHighlight.feature.geometry.applyMatrix( new THREE.Matrix4().makeRotationX( Math.PI / -2 ) );
			currentHighlight.feature.geometry.computeBoundingSphere();
			//feature.geometry.vertices.needsUpdate = true;
			//currentHighlight.feature.geometry.radiusTop = currentHighlight.style.startLineWidth;
			//currentHighlight.feature.geometry.radiusBottom = currentHighlight.style.endLineWidth;
			currentHighlight.feature.geometry.verticesNeedUpdate = true;
						
			for( var i = 0; i < currentHighlight.feature.geometry.vertices.length; i ++ )
			{
				if( i < currentHighlight.feature.geometry.vertices.length/2 - 1 || i == currentHighlight.feature.geometry.vertices.length - 2 ) 
				{
					currentHighlight.feature.material.attributes.colour.value[i] = lStyle.startColour;
					currentHighlight.feature.material.attributes.alpha.value[i] = lStyle.startAlpha;
				}
				else if( i >= currentHighlight.feature.geometry.vertices.length/2-1 )
				{
					currentHighlight.feature.material.attributes.colour.value[i] = lStyle.endColour;
					currentHighlight.feature.material.attributes.alpha.value[i] = lStyle.endAlpha;
				}
			}
			
			currentHighlight.feature.material.attributes.colour.needsUpdate = true;
			currentHighlight.feature.material.attributes.alpha.needsUpdate = true;		
		}
			
		currentHighlight.feature = null;
		currentHighlight.fid = null;
		currentHighlight.dataPointIndex = null;
		currentHighlight.style = null;
		currentHighlight.hstyle = null;
		currentHighlight.hobject = null;
		
		this.stmap.refresh();		
	};
	
};// end of SpatioTemporalLayer

STMAP2D.SpatioTemporalLayer.prototype = new STMAP2D.Layer;

/** **************************************************************** **/
/**
 * 
 */
STMAP2D.STPeriodSetLayer = function( name, data, properties )
{
	// do I need to implement this?
	// probably not
};

STMAP2D.SpatioTemporalLayer.prototype = new STMAP2D.Layer;

/** **************************************************************** **/

/**
 * Object used to represent a layer with information of trajectory points on a STMAP2D
 * @param name <String> layer's name (works as an id)
 * @param object <Object> data object containing the points 
 * @param pstyles <Array:<STMAP2D.Style>> objects representing the visual attributes of the points in this layer
 * @param lstyles <Array:<STMAP2D.Style>> objects representing the visual attributes of the lines in this layer
 */  
STMAP2D.TrajectoryLayer = function( name, object, pointstyles, linestyles )
{
	STMAP2D.Layer.call( this, name, object, pointstyles, linestyles );
}

STMAP2D.TrajectoryLayer.prototype = new STMAP2D.Layer;

/** **************************************************************** **/

/**
 * Object used to represent a layer with information of sets spatio-temporal points on a STMAP2D, using particles to represent those points
 * @param name <String> layer's name (works as an id)
 * @param object <Object> data object containing the points 
 * @param pstyles <Array:<STMAP2D.Style>> objects representing the visual attributes of the points in this layer
 */   
STMAP2D.STPointSetParticleLayer = function( name, object, styles )
{
	this.styles = styles;
	STMAP2D.Layer.call( this, name, object, styles, null );
}

STMAP2D.STPointSetParticleLayer.prototype = new STMAP2D.Layer;

/** **************************************************************** **/

/**
 * Object used to represent a layer with information of sets spatio-temporal points on a STMAP2D, using planes to represent those points
 * @param name <String> layer's name (works as an id)
 * @param object <Object> data object containing the points 
 * @param pstyles <Array:<STMAP2D.Style>> objects representing the visual attributes of the points in this layer
 */   
STMAP2D.STPointSetPlaneLayer = function( name, object, styles )
{	
	this.styles = styles;
	STMAP2D.Layer.call( this, name, object, styles, null );
}

STMAP2D.STPointSetParticleLayer.prototype = new STMAP2D.Layer;

/** **************************************************************** **/

/**
 * Utility functions
 */ 
STMAP2D.UTILS = function(){};

/**
 * 
 */
STMAP2D.UTILS.TIME_FLAGS = 
{
	ONE_HOUR: 3600, // (sec)
	ONE_DAY: 86400, // (sec)
	ONE_WEEK: 604800, // 7 days
	ONE_MONTH: 2592000, // 30 days
	NONE: -1
};

/**
 * 
 */
STMAP2D.UTILS.OBJECT_TYPES = 
{
	PLANE_POINT: "stplanepoint",
	H_PARTICLE_POINT: "stpartpoint_h",
	HCLINE: "hcpline",
	PARTICLE_POINT: "stpartpoint", 
	CUBE_POINT: "stcubepoint",
	SPHERE_POINT: "stspherepoint",
	LINE: "stline",
	POLYLINE: "stpolyline",
	CYLINDER_PERIOD: "stcylperiod"
};

/**
 * 
 */ 
STMAP2D.UTILS.createAttributesObject = function()
{
	var attributes = {};
	attributes.size = {};
	attributes.alpha = {};
	attributes.colour = {};
	attributes.rotation = {};
	
	attributes.size.type = "f";
	attributes.alpha.type = "f";
	attributes.colour.type = "c";
	attributes.rotation.type = "f";
	
	attributes.size.value = [];
	attributes.alpha.value = [];
	attributes.colour.value = [];
	attributes.rotation.value = [];
	
	return attributes;
};

/**
 * Calculates the closest point to pointC in the line that passes through pointA and pointB
 * @param stc -
 * @param pointA - 3D point where the line 'begins'
 * @param pointB - 3D point where the line 'ends'
 * @param pointC - 3D point from which we want to find the closest point of
 * @returns closest point of pointC in the line defined by pointA and pointB
 */
STMAP2D.UTILS.getClosestPointTo3DLine = function( stc, pointA, pointB, pointC )
{
	/*var b = stc.stpoint2stc( pointB );
	var a = stc.stpoint2stc( pointA );
	var c = pointC;*/
							
	var ab = pointB.sub( pointA );
	var ac = pointC.sub( pointA );						
	var w2 = ac.sub( ab.multiplyScalar( ac.dot(ab)/ab.lengthSq() ) ); 
	
	return pointC.sub(w2);
};

/**
 * Converst a colour in hsv format to rbb
 * @param h <Float> hue
 * @param s <Float> staturation
 * @param v <Float> value
 */ 
STMAP2D.UTILS.hsvToRgb = function( h, s, v ) 
{
	var r, g, b;
	var i;
	var f, p, q, t;
	
	// Make sure our arguments stay in-range
	h = Math.max(0, Math.min(360, h));
	s = Math.max(0, Math.min(100, s));
	v = Math.max(0, Math.min(100, v));
	
	// We accept saturation and value arguments from 0 to 100 because that's
	// how Photoshop represents those values. Internally, however, the
	// saturation and value are calculated from a range of 0 to 1. We make
	// That conversion here.
	s /= 100;
	v /= 100;
	
	if(s == 0) {
		// Achromatic (grey)
		r = g = b = v;
		return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	}
		
	h /= 60; // sector 0 to 5
	i = Math.floor(h);
	f = h - i; // factorial part of h
	p = v * (1 - s);
	q = v * (1 - s * f);
	t = v * (1 - s * (1 - f));

	switch(i) {
		case 0:	r = v; g = t; b = p; break;
		case 1: r = q; g = v; b = p; break;
		case 2: r = p; g = v; b = t; break;
		case 3: r = p; g = q; b = v; break;
		case 4: r = t; g = p; b = v; break;
		default: r = v; g = p; b = q;
	}
	//return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	return 'rgb('+Math.round(r * 255)+','+Math.round(g * 255)+','+Math.round(b * 255)+')'
};
	
/**
 * Gets total colours
 * @param total <Integer> number of colours
 * @returns <Array:<String>> Array with total nº of colours
 */
STMAP2D.UTILS.getRandomColours = function( total )
{
	var delta = 360 / (total - 1); // distribute the colors evenly on the hue range
	var colours = []; // hold the generated colors
	var hue = Math.random()*360;
	for( var i = 0; i < total; i++ )
	{
		var randomSaturation = Math.random()*100;
		var randomValue = Math.random()*30+65;
		colours.push( STMAP2D.UTILS.hsvToRgb( hue, randomSaturation, randomValue ) );
		hue = ( hue + delta ) % 360;
	}	
	return colours;	
};
	
/**
* Generates glsl code for the vertex shader to be used for the definition of particle points
* @param attr - key: <bool>value array with the the types of attributes in need to be used 
* @returns <String> glsl code
*/  
STMAP2D.UTILS.generateParticleVertexShader = function( attr )
{
	var vertexShaderText = "";//"//auto generated vertex shader\n";
	if( "size" in attr ) vertexShaderText += "attribute float size;\n";
	if( "alpha" in attr ) vertexShaderText += "attribute float alpha;\n";
	if( "color" in attr ) vertexShaderText += "attribute vec3 colour;\n";		
	if( "rotation" in attr ) vertexShaderText += "attribute float rotation;\n";

	if( "alpha" in attr ) vertexShaderText += "varying float vAlpha;\n";
	if( "color" in attr ) vertexShaderText += "varying vec3 vColor;\n";		
	if( "rotation" in attr ) vertexShaderText += "varying float vRotation;\n";

	vertexShaderText += "void main()\n{\n  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );\n  gl_Position = projectionMatrix * mvPosition;\n  ";
	if( "size" in attr ) vertexShaderText += "gl_PointSize = size;\n  ";
	else vertexShaderText += "gl_PointSize = 3;\n  ";
	if( "alpha" in attr ) vertexShaderText += "vAlpha = alpha;\n  ";
	else vertexShaderText += "vAlpha = 1;\n  ";
	if( "color" in attr ) vertexShaderText += "vColor = colour;\n";
	else vertexShaderText += "vColor = vec3(0,0,0);\n";
	if( "rotation" in attr ) vertexShaderText += "vRotation = rotation;\n"
	vertexShaderText += "}\n";		 
	return vertexShaderText;
};

/**
* Generates glsl code for the fragment shader to be used for the definition of particle points
* @param attr - key: <bool>value array with the the types of attributes in need to be used 
* @returns <String> glsl code
*/ 
STMAP2D.UTILS.generateParticleFragmentShader = function( attr )
{
	 var fragmentShaderText = "";//"//auto generated fragment shader\n";
	 
	 if( "texture" in attr ) fragmentShaderText += "uniform sampler2D texture;\n\n";
	 if( "alpha" in attr ) fragmentShaderText += "varying float vAlpha;\n";
	 if( "color" in attr ) fragmentShaderText += "varying vec3 vColor;\n";
	 if( "rotation" in attr ) fragmentShaderText += "varying float vRotation;\n";
	 
	 fragmentShaderText += "void main()\n{\n  ";
	 var alphaText = ("alpha" in attr)? "vAlpha" : "1.0" ;		 
	 
	 if( "color" in attr ) fragmentShaderText += "gl_FragColor = vec4( vColor, "+alphaText+" );\n";
	 else fragmentShaderText += "gl_FragColor = vec4( 0.0, 0.0, 0.0, "+alphaText+" );\n";
	 
	 if( "texture" in attr ) 
		if( "rotation" in attr )
		{
			fragmentShaderText += "  float mid = 0.5;\n";
			fragmentShaderText += "  vec2 rotated = vec2(cos(vRotation) * (gl_PointCoord.x - mid) + sin(vRotation) * (gl_PointCoord.y - mid) + mid, cos(vRotation) * (gl_PointCoord.y - mid) - sin(vRotation) * (gl_PointCoord.x - mid) + mid);\n";
			fragmentShaderText += "  gl_FragColor = gl_FragColor * texture2D( texture, rotated );\n";
		}
		else
			fragmentShaderText += "  gl_FragColor = gl_FragColor * texture2D( texture, gl_PointCoord );\n";
	 
	 fragmentShaderText += "}\n";
		 
	 return fragmentShaderText;
};

 /**
* Generates glsl code for the vertex shader to be used for the definition of lines
* @param attr - key: <bool>value array with the the types of attributes in need to be used 
* @returns <String> glsl code
*/ 
STMAP2D.UTILS.generateLineVertexShader = function( attr )
{
	var vertexShaderText = "";//"//auto generated vertex shader\n";		 
	
	if( "alpha" in attr ) vertexShaderText += "attribute float alpha;\n";
	if( "color" in attr ) vertexShaderText += "attribute vec3 colour;\n";
	if( "dashed" in attr ) vertexShaderText += "attribute float lineDistance;\nattribute float dashSize;\nattribute float totalSize;\n"+
	"varying float vLineDistance;\nvarying float vDashSize;\nvarying float vTotalSize;";
		 
	if( "alpha" in attr ) vertexShaderText += "varying float vAlpha;\n  ";
	if( "color" in attr ) vertexShaderText += "varying vec3 vColor;\n  ";		 

	vertexShaderText += "void main()\n{\n  gl_Position = projectionMatrix * modelViewMatrix *vec4(position, 1.0);\n  ";		 		 

	if( "dashed" in attr ) vertexShaderText += "vLineDistance = 1.0*lineDistance;\n  vDashSize = dashSize;\n  vTotalSize = totalSize;\n  "; // scale*lineDistance
	if( "alpha" in attr ) vertexShaderText += "vAlpha = alpha;\n  ";
	else vertexShaderText += "vAlpha = 1.0;\n  ";
	if( "color" in attr ) vertexShaderText += "vColor = colour;\n";
	else vertexShaderText += "vColor = vec3(0,0,0);\n";		 

	vertexShaderText += "}\n";
			 
	return vertexShaderText;
};

/**
* Generates glsl code for the fragment shader to be used for the definition of lines
* @param attr - key: <bool>value array with the the types of attributes in need to be used 
* @returns <String> glsl code
*/ 
STMAP2D.UTILS.generateLineFragmentShader = function( attr )
{
	var fragmentShaderText = "";//"//auto generated fragment shader\n";		 
	if( "alpha" in attr ) fragmentShaderText += "varying float vAlpha;\n";
	if( "color" in attr ) fragmentShaderText += "varying vec3 vColor;\n";
	if( "dashed" in attr ) fragmentShaderText += "varying float vLineDistance;\nvarying float vDashSize;\nvarying float vTotalSize;\n  ";
	fragmentShaderText += "void main()\n{\n  ";
	var alphaText = ("alpha" in attr)? "vAlpha" : "1" ;

	if( "dashed" in attr ) fragmentShaderText += "if( mod( vLineDistance, vTotalSize ) > vDashSize ) { discard; }\n  ";

	if( "color" in attr ) fragmentShaderText += "gl_FragColor = vec4( vColor, "+alphaText+" );\n";
	else fragmentShaderText += "gl_FragColor = vec4( 0.0, 0.0, 0.0, "+alphaText+" );\n";		 

	fragmentShaderText += "}\n";

	return fragmentShaderText;
};

/**
 * Genrates a texture/sprite
 * @param width <Float> width of the sprite
 * @param height <Float> height of the spirte
 * @returns <Canvas> representing the sprite
 */	
STMAP2D.UTILS.generateSprite = function( width, height ) 
{
	var canvas = document.createElement('canvas'),
	  context = canvas.getContext('2d'),
	  gradient;

	canvas.width = width;
	canvas.height = height;

	gradient = context.createRadialGradient(
	  canvas.width / 2, canvas.height / 2, 0,
	  canvas.width / 2, canvas.height / 2, canvas.width / 2
	);

	gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
	gradient.addColorStop(0.0, 'rgba(255,255,255,1)');

	context.fillStyle = gradient;
	context.fillRect(0, 0, canvas.width, canvas.height);

	return canvas;
};
	
/**
 * Returns a div's dimensions
 * @param div
 * @returns key:value array with div's dimensions
 */ 
STMAP2D.UTILS.getDivSize = function( div )
{
	return {w: div.clientWidth, h: div.clientHeight};
};


/**
 * Returns the screen location of an html object 
 * @param obj - object to locate
 * @return an array with two positions with the left and top positions of the object
 */ 
STMAP2D.UTILS.findObjectPosition = function(obj) 
{
	var curleft = curtop = 0;
	if (obj.offsetParent) 
	{
		do
		{
			curleft += obj.offsetLeft;
			curtop += obj.offsetTop;
		}
		while (obj = obj.offsetParent);
	}
	return [curleft,curtop];
};

/** **************************************************************** **/

/**
 * Map Styles
 */ 
STMAP2D.STYLES = function(){};

STMAP2D.STYLES.DEFAULT_STYLE = 
[
	{
		"featureType": "landscape",
		"elementType": "labels",
		"stylers": [ { "visibility": "off" } ]
	},
	{
		"featureType": "transit",
		"elementType": "labels",
		"stylers": [ { "visibility": "off" } ]
	},
	{
		"featureType": "poi",
		"elementType": "labels",
		"stylers": [ { "visibility": "off" } ]
	},
	{
		"featureType": "water",
		"elementType": "geometry",
		"stylers": [
			{ "invert_lightness": true },
			{ "lightness": 20 }, 
			{ "saturation": -100 },
			{ "visibility": "on" } ]
	},
	{
		"featureType": "road",
		"elementType": "labels.icon",
		"stylers": [ { "visibility": "off" } ]
	},
	{
		"stylers": [
			{ "hue": "#00aaff" },
			{ "saturation": -100 },
			{ "gamma": 2.15 },
			{ "lightness": 12 }
		]
	},
	{
		"featureType": "road",
		"elementType": "labels.text.fill",
		"stylers": [
			{ "visibility": "on" },
			{ "lightness": 2 }
		]
	},
	{
		"featureType": "road",
		"elementType": "geometry",
		"stylers": [ { "lightness": 10 } ]
	},
	{
		"featureType": "road.highway",
		"stylers": [
			{ "saturation": -100 },
			{"lightness": 10 },
			{ "visibility": "simplified" }
		]
	},
	{
		"featureType": "road.arterial",
		"stylers": [
			{ "saturation": -100 },
			{ "lightness": 10 },
			{ "visibility": "on" }
		]
	}
];

STMAP2D.STYLES.GREY_SCALE = 
[
	{
		"featureType": "landscape",
		"stylers": [ 
			{"saturation": -100 },
			{"lightness": 10 },
			{ "visibility": "on" }
		]
	},
	{
		"featureType": "poi",
		"stylers": [
			{ "saturation": -100 },
			{ "lightness": 51 },
			{ "visibility": "simplified" }
		]
	},
	{
		"featureType": "road.highway",
		"stylers": [
			{ "saturation": -100 },
			{"lightness": 10 },
			{ "visibility": "simplified" }
		]
	},
	{
		"featureType": "road.arterial",
		"stylers": [
			{ "saturation": -100 },
			{ "lightness": 10 },
			{ "visibility": "on" }
		]
	},
	{
		"featureType": "road.local",
		"stylers": [
			{ "saturation": -100 },
			{ "lightness": 40 },
			{ "visibility": "on" }
		]
	},
	{
		"featureType": "transit",
		"stylers": [
			{ "saturation": -100 },
			{ "visibility": "simplified" }
		]
	},
	{
		"featureType": "administrative.province",
		"stylers": [
			{ "visibility": "off" }
		]
	},
	{
		"featureType": "water",
		"elementType": "labels",
		"stylers": [
			{ "visibility": "on" },
			{ "lightness": -25 },
			{ "saturation": -100 }
		]
	},
	{
		"featureType": "water",
		"elementType": "geometry",
		"stylers": [
			{ "hue": "#ffff00" },
			{ "lightness": -25 },
			{ "saturation": -97 }
		]
	}
];
	
STMAP2D.STYLES.BLACK_SCALE = 
[
	{
	"stylers": [
	  { "invert_lightness": true },
	  { "saturation": -100 },
	  { "visibility": "on" }
	]
	},{
	"elementType": "labels",
	"stylers": [
	  { "visibility": "off" }
	]
	},{
	"featureType": "landscape",
	"stylers": [
	  { "color": "#111111" }
	]
	},{
	"featureType": "road",
	"stylers": [
	  { "visibility": "off" }
	]
	},{
	"featureType": "poi",
	"stylers": [
	  { "visibility": "off" }
	]
	},{
	"featureType": "administrative",
	"stylers": [
	  { "visibility": "on" }
	]
	},{
	"featureType": "administrative.country",
	"elementType": "geometry",
	"stylers": [
	  { "visibility": "on" }
	]
	}
];
